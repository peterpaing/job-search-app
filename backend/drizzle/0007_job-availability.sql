-- Custom SQL migration file, put your code below! --

-- Intentionally no foreign key:
-- retain a small closed-job tombstone after deleting the main job row.
CREATE TABLE public.job_availability (
  job_id text PRIMARY KEY,
  expires_at timestamptz,
  closed_at timestamptz,
  closure_reason text,

  last_checked_at timestamptz,
  last_checked_url text,
  last_result text,
  last_http_status integer,

  missing_checks integer NOT NULL DEFAULT 0
    CHECK (missing_checks >= 0),
  last_missing_at timestamptz
);

--> statement-breakpoint

CREATE INDEX job_availability_closed_at_idx
  ON public.job_availability (closed_at)
  WHERE closed_at IS NOT NULL;

--> statement-breakpoint

CREATE INDEX job_availability_last_checked_at_idx
  ON public.job_availability (last_checked_at);

--> statement-breakpoint

CREATE INDEX job_availability_expires_at_idx
  ON public.job_availability (expires_at)
  WHERE expires_at IS NOT NULL;

--> statement-breakpoint

-- Existing inactive jobs start their retention period now.
-- Their actual historical closure date is unknown.
INSERT INTO public.job_availability (
  job_id,
  closed_at,
  closure_reason
)
SELECT id, now(), 'previously_inactive'
FROM public.jobs
WHERE is_active = false;

--> statement-breakpoint

CREATE FUNCTION public.guard_job_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  availability public.job_availability%ROWTYPE;
BEGIN
  SELECT *
  INTO availability
  FROM public.job_availability
  WHERE job_id = NEW.id;

  -- A stale feed must not resurrect a closed or purged listing.
  IF availability.closed_at IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NULL;
    END IF;

    NEW.is_active := false;
  END IF;

  IF availability.expires_at IS NOT NULL
     AND availability.expires_at <= now() THEN
    NEW.is_active := false;
  END IF;

  IF NEW.is_active = false THEN
    INSERT INTO public.job_availability (
      job_id,
      closed_at,
      closure_reason
    )
    VALUES (
      NEW.id,
      now(),
      CASE
        WHEN availability.expires_at <= now()
          THEN 'listing_expired'
        ELSE 'marked_inactive'
      END
    )
    ON CONFLICT (job_id) DO UPDATE
    SET
      closed_at = COALESCE(
        job_availability.closed_at,
        EXCLUDED.closed_at
      ),
      closure_reason = COALESCE(
        job_availability.closure_reason,
        EXCLUDED.closure_reason
      );
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER jobs_availability_guard
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.guard_job_availability();

--> statement-breakpoint

-- Atomic result recording.
-- All checks lock the job first, then its availability record.
CREATE FUNCTION public.record_job_availability(
  p_job_id text,
  p_url text,
  p_result text,
  p_reason text,
  p_http_status integer,
  p_checked_at timestamptz,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  current_job public.jobs%ROWTYPE;
  availability public.job_availability%ROWTYPE;
  missing_count integer;
  missing_at timestamptz;
  effective_result text := p_result;
BEGIN
  IF p_result NOT IN (
    'source',
    'active',
    'closed',
    'missing',
    'unknown'
  ) THEN
    RAISE EXCEPTION 'Invalid availability result';
  END IF;

  SELECT *
  INTO current_job
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  -- Ignore results for a deleted job or a changed listing URL.
  IF NOT FOUND OR current_job.url IS DISTINCT FROM p_url THEN
    RETURN 'skipped';
  END IF;

  INSERT INTO public.job_availability (job_id)
  VALUES (p_job_id)
  ON CONFLICT (job_id) DO NOTHING;

  SELECT *
  INTO availability
  FROM public.job_availability
  WHERE job_id = p_job_id
  FOR UPDATE;

  -- Imported source expiry is not a website verification.
  -- Do not let it reset page-check timestamps or missing checks.
  IF p_result = 'source' THEN
    IF p_expires_at IS NULL THEN
      RETURN 'unknown';
    END IF;

    UPDATE public.job_availability
    SET expires_at = GREATEST(expires_at, p_expires_at)
    WHERE job_id = p_job_id
    RETURNING * INTO availability;

    IF availability.expires_at <= now() THEN
      UPDATE public.job_availability
      SET
        closed_at = COALESCE(closed_at, now()),
        closure_reason = COALESCE(
          closure_reason,
          'source_expiry'
        )
      WHERE job_id = p_job_id;

      UPDATE public.jobs
      SET is_active = false, updated_at = now()
      WHERE id = p_job_id;

      RETURN 'closed';
    END IF;

    RETURN 'unknown';
  END IF;

  -- An older concurrent check must not overwrite a newer result.
  IF availability.last_checked_at IS NOT NULL
     AND availability.last_checked_at >= p_checked_at THEN
    RETURN 'skipped';
  END IF;

  missing_count := availability.missing_checks;
  missing_at := availability.last_missing_at;

  IF availability.last_checked_url IS DISTINCT FROM p_url THEN
    missing_count := 0;
    missing_at := NULL;
  END IF;

  IF p_result = 'missing' THEN
    -- Require two 404/410 checks at least 24 hours apart.
    IF missing_at IS NULL
       OR p_checked_at >= missing_at + interval '24 hours' THEN
      missing_count := missing_count + 1;
      missing_at := p_checked_at;
    END IF;

    effective_result := CASE
      WHEN missing_count >= 2 THEN 'closed'
      ELSE 'unknown'
    END;
  ELSE
    -- Errors and successful non-missing responses break the streak.
    missing_count := 0;
    missing_at := NULL;
  END IF;

  -- Reopening requires a verified future expiry.
  IF effective_result = 'active'
     AND (
       p_expires_at IS NULL
       OR p_expires_at <= now()
     ) THEN
    effective_result := 'unknown';
  END IF;

  UPDATE public.job_availability
  SET
    last_checked_at = p_checked_at,
    last_checked_url = p_url,
    last_result = effective_result,
    last_http_status = p_http_status,
    missing_checks = missing_count,
    last_missing_at = missing_at
  WHERE job_id = p_job_id;

  IF effective_result = 'closed' THEN
    UPDATE public.job_availability
    SET
      closed_at = COALESCE(closed_at, now()),
      closure_reason = COALESCE(closure_reason, p_reason),
      expires_at = COALESCE(p_expires_at, expires_at)
    WHERE job_id = p_job_id;

    UPDATE public.jobs
    SET is_active = false, updated_at = now()
    WHERE id = p_job_id;

  ELSIF effective_result = 'active' THEN
    -- Clear the guard before reopening the job.
    UPDATE public.job_availability
    SET
      closed_at = NULL,
      closure_reason = NULL,
      expires_at = p_expires_at
    WHERE job_id = p_job_id;

    UPDATE public.jobs
    SET is_active = true, updated_at = now()
    WHERE id = p_job_id;
  END IF;

  RETURN effective_result;
END;
$$;