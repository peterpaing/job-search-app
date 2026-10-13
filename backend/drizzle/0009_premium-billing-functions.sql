-- Custom SQL migration file, put your code below! --

CREATE OR REPLACE FUNCTION billing_commit_snapshot(
  p_customer_id text,
  p_owner uuid,
  p_subscriptions jsonb,
  p_event_id text DEFAULT NULL,
  p_risk_hold boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer billing_customers%ROWTYPE;
BEGIN
  SELECT *
  INTO v_customer
  FROM billing_customers
  WHERE stripe_customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_customer.sync_owner IS DISTINCT FROM p_owner
     OR v_customer.sync_until IS NULL
     OR v_customer.sync_until <= clock_timestamp()
  THEN
    RAISE EXCEPTION 'Billing synchronization lease expired';
  END IF;

  -- Replace access from a complete, freshly fetched Stripe snapshot.
  -- Old webhook payloads are not used to restore subscription state.
  UPDATE billing_subscriptions
  SET premium = false,
      updated_at = clock_timestamp()
  WHERE stripe_customer_id = p_customer_id;

  INSERT INTO billing_subscriptions (
    stripe_subscription_id,
    stripe_customer_id,
    price_id,
    status,
    premium,
    paid_until,
    cancel_at_period_end,
    updated_at
  )
  SELECT
    snapshot.subscription_id,
    p_customer_id,
    snapshot.price_id,
    snapshot.status,
    snapshot.premium,
    snapshot.paid_until,
    snapshot.cancel_at_period_end,
    clock_timestamp()
  FROM jsonb_to_recordset(p_subscriptions) AS snapshot(
    subscription_id text,
    price_id text,
    status text,
    premium boolean,
    paid_until timestamptz,
    cancel_at_period_end boolean
  )
  ON CONFLICT (stripe_subscription_id)
  DO UPDATE SET
    price_id = EXCLUDED.price_id,
    status = EXCLUDED.status,
    premium = EXCLUDED.premium,
    paid_until = EXCLUDED.paid_until,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at = EXCLUDED.updated_at
  WHERE billing_subscriptions.stripe_customer_id =
        EXCLUDED.stripe_customer_id;

  UPDATE billing_customers
  SET synced_at = clock_timestamp(),
      risk_hold = risk_hold OR p_risk_hold
  WHERE stripe_customer_id = p_customer_id;

  IF p_event_id IS NOT NULL THEN
    INSERT INTO billing_events (stripe_event_id, livemode)
    VALUES (p_event_id, v_customer.livemode)
    ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;
END;
$$;