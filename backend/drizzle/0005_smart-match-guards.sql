-- Custom SQL migration file, put your code below! --

CREATE OR REPLACE FUNCTION smart_match_reserve(
  p_user_id uuid,
  p_lease_id uuid,
  p_user_limit integer,
  p_budget_cents integer,
  p_reservation_cents integer
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_user_requests integer;
  v_reserved_cents integer;
BEGIN
  -- Serializes reservation and profile mutation across server instances.
  PERFORM pg_advisory_xact_lock(951714);

  IF p_user_limit <= 0
    OR p_budget_cents <= 0
    OR p_reservation_cents <= 0 THEN
    RETURN 'disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM smart_match_locks
    WHERE user_id = p_user_id
      AND expires_at > now()
  ) THEN
    RETURN 'busy';
  END IF;

  SELECT requests
  INTO v_user_requests
  FROM smart_match_usage
  WHERE scope = 'user:' || p_user_id::text
    AND day = v_day;

  IF COALESCE(v_user_requests, 0) >= p_user_limit THEN
    RETURN 'user_limit';
  END IF;

  SELECT reserved_cents
  INTO v_reserved_cents
  FROM smart_match_usage
  WHERE scope = 'global'
    AND day = v_day;

  IF COALESCE(v_reserved_cents, 0) + p_reservation_cents
    > p_budget_cents THEN
    RETURN 'budget_limit';
  END IF;

  INSERT INTO smart_match_locks (user_id, lease_id, expires_at)
  VALUES (
    p_user_id,
    p_lease_id,
    now() + interval '10 minutes'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lease_id = EXCLUDED.lease_id,
    expires_at = EXCLUDED.expires_at;

  INSERT INTO smart_match_usage (
    scope, day, requests, reserved_cents
  )
  VALUES (
    'user:' || p_user_id::text,
    v_day,
    1,
    p_reservation_cents
  )
  ON CONFLICT (scope, day) DO UPDATE SET
    requests = smart_match_usage.requests + 1,
    reserved_cents =
      smart_match_usage.reserved_cents + p_reservation_cents;

  INSERT INTO smart_match_usage (
    scope, day, requests, reserved_cents
  )
  VALUES (
    'global',
    v_day,
    1,
    p_reservation_cents
  )
  ON CONFLICT (scope, day) DO UPDATE SET
    requests = smart_match_usage.requests + 1,
    reserved_cents =
      smart_match_usage.reserved_cents + p_reservation_cents;

  DELETE FROM smart_match_cache
  WHERE user_id = p_user_id
    AND expires_at <= now();

  RETURN 'ok';
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION smart_match_store_profile(
  p_user_id uuid,
  p_profile jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  IF EXISTS (
    SELECT 1
    FROM smart_match_locks
    WHERE user_id = p_user_id
      AND expires_at > now()
  ) THEN
    RETURN false;
  END IF;

  IF p_profile IS NULL THEN
    DELETE FROM smart_match_profiles
    WHERE user_id = p_user_id;

    DELETE FROM smart_match_cache
    WHERE user_id = p_user_id;
  ELSE
    INSERT INTO smart_match_profiles (
      user_id, profile, updated_at
    )
    VALUES (
      p_user_id, p_profile, clock_timestamp()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      profile = EXCLUDED.profile,
      updated_at = EXCLUDED.updated_at;

    DELETE FROM smart_match_cache
    WHERE user_id = p_user_id
      AND kind = 'answer';
  END IF;

  RETURN true;
END;
$$;