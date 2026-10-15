-- Custom SQL migration file, put your code below! --

CREATE FUNCTION smart_match_reserve_costs_with_owner(
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
  v_owner boolean := false;
  v_limits jsonb := p_limits;

  v_day date :=
    (now() AT TIME ZONE 'UTC')::date;

  v_month date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'UTC'
    )::date;

  v_scope text := 'user:' || p_user_id::text;
  v_personal_limits jsonb;
BEGIN
  -- Use the same lock as the existing reservation function.
  -- Nested acquisition in the same transaction is safe.
  PERFORM pg_advisory_xact_lock(951714);

  -- The configured Clerk ID comes from the trusted backend.
  -- Verify its mapping to this database user.
  SELECT EXISTS (
    SELECT 1
    FROM users
    WHERE id = p_user_id
      AND clerk_user_id = NULLIF(
        p_limits->>'ownerClerkUserId',
        ''
      )
  )
  INTO v_owner;

  IF v_owner AND p_tokens > 0 AND p_micro > 0 THEN
    -- Set personal thresholds to admit this request.
    -- Do not alter counters or global budgets.
    --
    -- The shared transaction lock prevents another reservation
    -- from changing these counters before the existing function runs.
    SELECT jsonb_build_object(
      'dailyRequests',
      COALESCE(
        MAX(requests) FILTER (
          WHERE period_kind = 'day'
            AND period_start = v_day
        ),
        0
      ) + 1,

      'monthlyRequests',
      COALESCE(
        MAX(requests) FILTER (
          WHERE period_kind = 'month'
            AND period_start = v_month
        ),
        0
      ) + 1,

      'dailyTokens',
      COALESCE(
        MAX(committed_tokens) FILTER (
          WHERE period_kind = 'day'
            AND period_start = v_day
        ),
        0
      ) + p_tokens,

      'monthlyTokens',
      COALESCE(
        MAX(committed_tokens) FILTER (
          WHERE period_kind = 'month'
            AND period_start = v_month
        ),
        0
      ) + p_tokens,

      'userMonthlyMicro',
      COALESCE(
        MAX(committed_micro) FILTER (
          WHERE period_kind = 'month'
            AND period_start = v_month
        ),
        0
      ) + p_micro
    )
    INTO v_personal_limits
    FROM smart_match_cost_usage
    WHERE scope = v_scope;

    v_limits := p_limits || v_personal_limits;
  END IF;

  -- Keep the existing global spending checks, request lease,
  -- reservation records, counters, and alerts.
  RETURN smart_match_reserve_costs(
    p_user_id,
    p_lease_id,
    p_kind,
    p_model,
    p_price_version,
    p_tokens,
    p_micro,
    v_limits
  );
END;
$$;