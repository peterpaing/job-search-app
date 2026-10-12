-- Custom SQL migration file, put your code below! --

CREATE TABLE smart_match_cost_usage (
  scope text NOT NULL,

  period_kind text NOT NULL
    CHECK (period_kind IN ('day', 'month')),

  period_start date NOT NULL,

  requests bigint NOT NULL DEFAULT 0
    CHECK (requests >= 0),

  committed_tokens bigint NOT NULL DEFAULT 0
    CHECK (committed_tokens >= 0),

  input_tokens bigint NOT NULL DEFAULT 0
    CHECK (input_tokens >= 0),

  cached_tokens bigint NOT NULL DEFAULT 0
    CHECK (cached_tokens >= 0),

  output_tokens bigint NOT NULL DEFAULT 0
    CHECK (output_tokens >= 0),

  measured_micro bigint NOT NULL DEFAULT 0
    CHECK (measured_micro >= 0),

  committed_micro bigint NOT NULL DEFAULT 0
    CHECK (committed_micro >= 0),

  unresolved_requests bigint NOT NULL DEFAULT 0
    CHECK (unresolved_requests >= 0),

  budget_micro bigint NOT NULL DEFAULT 0
    CHECK (budget_micro >= 0),

  PRIMARY KEY (
    scope,
    period_kind,
    period_start
  )
);

--> statement-breakpoint

CREATE TABLE smart_match_cost_requests (
  lease_id uuid PRIMARY KEY,

  user_scope text NOT NULL,
  day date NOT NULL,
  month date NOT NULL,

  kind text NOT NULL
    CHECK (kind IN ('extract', 'answer')),

  model text NOT NULL,
  price_version text NOT NULL,

  reserved_tokens bigint NOT NULL
    CHECK (reserved_tokens > 0),

  reserved_micro bigint NOT NULL
    CHECK (reserved_micro > 0),

  input_tokens bigint,
  cached_tokens bigint,
  output_tokens bigint,
  cost_micro bigint,

  status text NOT NULL DEFAULT 'reserved'
    CHECK (
      status IN (
        'reserved',
        'known',
        'unknown'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

--> statement-breakpoint

CREATE INDEX smart_match_cost_requests_scope_month_idx
ON smart_match_cost_requests (
  user_scope,
  month
);

--> statement-breakpoint

CREATE TABLE smart_match_spend_alerts (
  period_kind text NOT NULL,
  period_start date NOT NULL,

  threshold integer NOT NULL
    CHECK (threshold IN (80, 100)),

  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (
    period_kind,
    period_start,
    threshold
  )
);

--> statement-breakpoint

-- Preserve historical request counts and conservative reservations.
-- Historical actual tokens/costs were not recorded by the old service.
INSERT INTO smart_match_cost_usage (
  scope,
  period_kind,
  period_start,
  requests,
  committed_micro,
  unresolved_requests
)
SELECT
  scope,
  'day',
  day,
  requests,
  reserved_cents::bigint * 10000,
  requests
FROM smart_match_usage;

--> statement-breakpoint

INSERT INTO smart_match_cost_usage (
  scope,
  period_kind,
  period_start,
  requests,
  committed_micro,
  unresolved_requests
)
SELECT
  scope,
  'month',
  date_trunc('month', day)::date,
  SUM(requests),
  SUM(reserved_cents::bigint) * 10000,
  SUM(requests)
FROM smart_match_usage
GROUP BY
  scope,
  date_trunc('month', day)::date;

--> statement-breakpoint

CREATE FUNCTION smart_match_cost_alerts(
  p_blocked_kind text DEFAULT NULL,

  p_day date DEFAULT
    (now() AT TIME ZONE 'UTC')::date,

  p_month date DEFAULT
    date_trunc(
      'month',
      now() AT TIME ZONE 'UTC'
    )::date
)
RETURNS jsonb
LANGUAGE sql
AS $$
  WITH added AS (
    INSERT INTO smart_match_spend_alerts (
      period_kind,
      period_start,
      threshold,
      payload
    )
    SELECT
      u.period_kind,
      u.period_start,
      t.threshold,

      jsonb_build_object(
        'period_kind',
        u.period_kind,

        'period_start',
        u.period_start,

        'threshold',
        t.threshold,

        'event',
        CASE
          WHEN t.threshold = 100
            AND p_blocked_kind = u.period_kind
          THEN 'budget_blocked'
          ELSE 'budget_threshold'
        END,

        'committed_micro',
        u.committed_micro,

        'measured_micro',
        u.measured_micro,

        'budget_micro',
        u.budget_micro
      )
    FROM smart_match_cost_usage u
    CROSS JOIN (
      VALUES (80), (100)
    ) t(threshold)

    WHERE u.scope = 'global'
      AND u.budget_micro > 0

      AND (
        (
          u.period_kind = 'day'
          AND u.period_start = p_day
        )
        OR (
          u.period_kind = 'month'
          AND u.period_start = p_month
        )
      )

      AND (
        u.committed_micro::numeric * 100
          >= u.budget_micro::numeric * t.threshold

        OR (
          t.threshold = 100
          AND p_blocked_kind = u.period_kind
        )
      )

    ON CONFLICT DO NOTHING
    RETURNING payload
  )

  SELECT COALESCE(
    jsonb_agg(payload),
    '[]'::jsonb
  )
  FROM added;
$$;

--> statement-breakpoint

CREATE FUNCTION smart_match_reserve_costs(
  p_user_id uuid,
  p_lease_id uuid,
  p_kind text,
  p_model text,
  p_price_version text,
  p_tokens bigint,
  p_micro bigint,
  p_limits jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_day date :=
    (now() AT TIME ZONE 'UTC')::date;

  v_month date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'UTC'
    )::date;

  v_scope text :=
    'user:' || p_user_id::text;

  v_ud smart_match_cost_usage%ROWTYPE;
  v_um smart_match_cost_usage%ROWTYPE;
  v_gd smart_match_cost_usage%ROWTYPE;
  v_gm smart_match_cost_usage%ROWTYPE;

  v_status text;
  v_alerts jsonb;

BEGIN
  -- Shared with profile mutation and the old reservation function.
  -- Serializes checks/bookings across backend instances.
  PERFORM pg_advisory_xact_lock(951714);

  IF p_tokens <= 0
    OR p_micro <= 0
    OR p_limits IS NULL

    OR COALESCE(
      (p_limits->>'dailyRequests')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'monthlyRequests')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'dailyTokens')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'monthlyTokens')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'userMonthlyMicro')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'globalDailyMicro')::bigint,
      0
    ) <= 0

    OR COALESCE(
      (p_limits->>'globalMonthlyMicro')::bigint,
      0
    ) <= 0

  THEN
    RETURN jsonb_build_object(
      'status',
      'disabled'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM smart_match_locks
    WHERE user_id = p_user_id
      AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object(
      'status',
      'busy'
    );
  END IF;

  INSERT INTO smart_match_cost_usage (
    scope,
    period_kind,
    period_start
  )
  VALUES
    (v_scope, 'day', v_day),
    (v_scope, 'month', v_month),
    ('global', 'day', v_day),
    ('global', 'month', v_month)
  ON CONFLICT DO NOTHING;

  UPDATE smart_match_cost_usage
  SET budget_micro =
    CASE
      WHEN period_kind = 'day'
      THEN
        (p_limits->>'globalDailyMicro')::bigint

      ELSE
        (p_limits->>'globalMonthlyMicro')::bigint
    END

  WHERE scope = 'global'
    AND (
      (
        period_kind = 'day'
        AND period_start = v_day
      )
      OR (
        period_kind = 'month'
        AND period_start = v_month
      )
    );

  SELECT *
  INTO STRICT v_ud
  FROM smart_match_cost_usage
  WHERE scope = v_scope
    AND period_kind = 'day'
    AND period_start = v_day;

  SELECT *
  INTO STRICT v_um
  FROM smart_match_cost_usage
  WHERE scope = v_scope
    AND period_kind = 'month'
    AND period_start = v_month;

  SELECT *
  INTO STRICT v_gd
  FROM smart_match_cost_usage
  WHERE scope = 'global'
    AND period_kind = 'day'
    AND period_start = v_day;

  SELECT *
  INTO STRICT v_gm
  FROM smart_match_cost_usage
  WHERE scope = 'global'
    AND period_kind = 'month'
    AND period_start = v_month;

  v_status :=
    CASE
      WHEN v_ud.requests
        >= (p_limits->>'dailyRequests')::bigint
      THEN 'daily_limit'

      WHEN v_um.requests
        >= (p_limits->>'monthlyRequests')::bigint
      THEN 'monthly_limit'

      WHEN v_ud.committed_tokens + p_tokens
        > (p_limits->>'dailyTokens')::bigint
      THEN 'daily_tokens'

      WHEN v_um.committed_tokens + p_tokens
        > (p_limits->>'monthlyTokens')::bigint
      THEN 'monthly_tokens'

      WHEN v_um.committed_micro + p_micro
        > (p_limits->>'userMonthlyMicro')::bigint
      THEN 'user_budget'

      WHEN v_gd.committed_micro + p_micro
        > v_gd.budget_micro
      THEN 'daily_budget'

      WHEN v_gm.committed_micro + p_micro
        > v_gm.budget_micro
      THEN 'monthly_budget'

      ELSE 'ok'
    END;

  IF v_status <> 'ok' THEN
    v_alerts := smart_match_cost_alerts(
      CASE
        WHEN v_status = 'daily_budget'
        THEN 'day'

        WHEN v_status = 'monthly_budget'
        THEN 'month'

        ELSE NULL
      END
    );

    RETURN jsonb_build_object(
      'status',
      v_status,
      'alerts',
      v_alerts
    );
  END IF;

  INSERT INTO smart_match_cost_requests (
    lease_id,
    user_scope,
    day,
    month,
    kind,
    model,
    price_version,
    reserved_tokens,
    reserved_micro
  )
  VALUES (
    p_lease_id,
    v_scope,
    v_day,
    v_month,
    p_kind,
    p_model,
    p_price_version,
    p_tokens,
    p_micro
  );

  UPDATE smart_match_cost_usage
  SET
    requests = requests + 1,

    committed_tokens =
      committed_tokens + p_tokens,

    committed_micro =
      committed_micro + p_micro,

    unresolved_requests =
      unresolved_requests + 1

  WHERE scope IN (v_scope, 'global')
    AND (
      (
        period_kind = 'day'
        AND period_start = v_day
      )
      OR (
        period_kind = 'month'
        AND period_start = v_month
      )
    );

  -- Preserve old daily request counters.
  -- New spending accounting lives in the new tables.
  INSERT INTO smart_match_usage (
    scope,
    day,
    requests,
    reserved_cents
  )
  VALUES
    (v_scope, v_day, 1, 0),
    ('global', v_day, 1, 0)

  ON CONFLICT (scope, day)
  DO UPDATE SET
    requests = smart_match_usage.requests + 1;

  INSERT INTO smart_match_locks (
    user_id,
    lease_id,
    expires_at
  )
  VALUES (
    p_user_id,
    p_lease_id,
    now() + interval '10 minutes'
  )

  ON CONFLICT (user_id)
  DO UPDATE SET
    lease_id = EXCLUDED.lease_id,
    expires_at = EXCLUDED.expires_at;

  DELETE FROM smart_match_cache
  WHERE user_id = p_user_id
    AND expires_at <= now();

  RETURN jsonb_build_object(
    'status',
    'ok',
    'alerts',
    smart_match_cost_alerts()
  );
END;
$$;

--> statement-breakpoint

CREATE FUNCTION smart_match_settle_costs(
  p_lease_id uuid,
  p_input bigint,
  p_cached bigint,
  p_output bigint,
  p_cost bigint
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_request smart_match_cost_requests%ROWTYPE;

BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  SELECT *
  INTO v_request
  FROM smart_match_cost_requests
  WHERE lease_id = p_lease_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',
      'missing'
    );
  END IF;

  -- Idempotent: repeated settlement never charges twice.
  IF v_request.status = 'known' THEN
    RETURN jsonb_build_object(
      'status',
      'ok',
      'alerts',
      '[]'::jsonb
    );
  END IF;

  IF p_input IS NULL
    OR p_cached IS NULL
    OR p_output IS NULL
    OR p_cost IS NULL
  THEN
    -- Unknown provider usage retains its reservation.
    UPDATE smart_match_cost_requests
    SET
      status = 'unknown',
      settled_at = now()
    WHERE lease_id = p_lease_id;

    RETURN jsonb_build_object(
      'status',
      'ok',
      'alerts',
      smart_match_cost_alerts(
        NULL,
        v_request.day,
        v_request.month
      )
    );
  END IF;

  IF p_input < 0
    OR p_cached < 0
    OR p_cached > p_input
    OR p_output < 0
    OR p_cost < 0
  THEN
    RAISE EXCEPTION 'Invalid token accounting';
  END IF;

  -- Always settle the periods where the request STARTED.
  -- Handles requests finishing after UTC midnight/month rollover.
  UPDATE smart_match_cost_usage
  SET
    committed_tokens =
      committed_tokens
      - v_request.reserved_tokens
      + p_input
      + p_output,

    input_tokens =
      input_tokens + p_input,

    cached_tokens =
      cached_tokens + p_cached,

    output_tokens =
      output_tokens + p_output,

    measured_micro =
      measured_micro + p_cost,

    committed_micro =
      committed_micro
      - v_request.reserved_micro
      + p_cost,

    unresolved_requests =
      unresolved_requests - 1

  WHERE scope IN (
    v_request.user_scope,
    'global'
  )
    AND (
      (
        period_kind = 'day'
        AND period_start = v_request.day
      )
      OR (
        period_kind = 'month'
        AND period_start = v_request.month
      )
    );

  UPDATE smart_match_cost_requests
  SET
    status = 'known',
    input_tokens = p_input,
    cached_tokens = p_cached,
    output_tokens = p_output,
    cost_micro = p_cost,
    settled_at = now()

  WHERE lease_id = p_lease_id;

  RETURN jsonb_build_object(
    'status',
    'ok',
    'alerts',
    smart_match_cost_alerts(
      NULL,
      v_request.day,
      v_request.month
    )
  );
END;
$$;