-- Custom SQL migration file, put your code below! --

CREATE TABLE account_deletions (
  user_id uuid PRIMARY KEY
    REFERENCES users(id) ON DELETE RESTRICT,

  clerk_user_id text,

  clerk_user_id_hash text NOT NULL UNIQUE
    CHECK (clerk_user_id_hash ~ '^[0-9a-f]{64}$'),

  requested_at timestamptz NOT NULL DEFAULT now(),

  billing_stopped_at timestamptz,
  clerk_deleted_at timestamptz,
  completed_at timestamptz,

  lease_owner uuid,
  lease_until timestamptz,

  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),

  next_attempt_at timestamptz NOT NULL DEFAULT now(),

  last_error text,

  CHECK (
    (lease_owner IS NULL) = (lease_until IS NULL)
  ),

  CHECK (
    completed_at IS NULL
    OR (
      billing_stopped_at IS NOT NULL
      AND clerk_deleted_at IS NOT NULL
      AND clerk_user_id IS NULL
    )
  )
);

--> statement-breakpoint

CREATE INDEX account_deletions_pending_idx
ON account_deletions(next_attempt_at)
WHERE completed_at IS NULL;

--> statement-breakpoint

-- Prevent an old Clerk session from recreating a deleted account.
CREATE FUNCTION account_deletion_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  IF EXISTS (
    SELECT 1
    FROM account_deletions
    WHERE clerk_user_id_hash = encode(
      sha256(convert_to(NEW.clerk_user_id, 'UTF8')),
      'hex'
    )
  ) THEN
    RAISE EXCEPTION 'Account deletion has been requested';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER users_account_deletion_guard
BEFORE INSERT OR UPDATE OF clerk_user_id
ON users
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_identity();

--> statement-breakpoint

-- Serialize private-data writes with the deletion request.
-- These locks last only for the database transaction;
-- no Stripe or Clerk requests run while holding them.
CREATE FUNCTION account_deletion_guard_private_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  IF EXISTS (
    SELECT 1
    FROM account_deletions
    WHERE user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Account deletion has been requested';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER saved_jobs_account_deletion_guard
BEFORE INSERT OR UPDATE
ON saved_jobs
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

CREATE TRIGGER applications_account_deletion_guard
BEFORE INSERT OR UPDATE
ON applications
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

CREATE TRIGGER smart_match_profiles_account_deletion_guard
BEFORE INSERT OR UPDATE
ON smart_match_profiles
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

CREATE TRIGGER smart_match_cache_account_deletion_guard
BEFORE INSERT OR UPDATE
ON smart_match_cache
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

-- AI reservations and their lock insertion share one transaction.
-- Rejecting this insertion also rolls back a new reservation.
CREATE TRIGGER smart_match_locks_account_deletion_guard
BEFORE INSERT OR UPDATE
ON smart_match_locks
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

CREATE TRIGGER billing_customers_account_deletion_guard
BEFORE INSERT
ON billing_customers
FOR EACH ROW
EXECUTE FUNCTION account_deletion_guard_private_data();

--> statement-breakpoint

-- The backend will use this instead of its current inline
-- billing-lease UPDATE, so checkout and deletion cannot race.
CREATE FUNCTION account_deletion_take_billing_lock(
  p_customer_id text,
  p_owner uuid,
  p_allow_deleting boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  UPDATE billing_customers c
  SET sync_owner = p_owner,
      sync_until = clock_timestamp() + interval '2 minutes'
  WHERE c.stripe_customer_id = p_customer_id
    AND (
      c.sync_until IS NULL
      OR c.sync_until <= clock_timestamp()
    )
    AND (
      p_allow_deleting
      OR NOT EXISTS (
        SELECT 1
        FROM account_deletions d
        WHERE d.user_id = c.user_id
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count = 1;
END;
$$;

--> statement-breakpoint

CREATE FUNCTION account_deletion_begin(
  p_clerk_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_hash text;
  v_existing account_deletions%ROWTYPE;
BEGIN
  IF p_clerk_user_id IS NULL
    OR left(p_clerk_user_id, 5) <> 'user_'
    OR length(p_clerk_user_id) > 255
  THEN
    RAISE EXCEPTION 'Invalid account identity';
  END IF;

  PERFORM pg_advisory_xact_lock(951714);

  v_hash := encode(
    sha256(convert_to(p_clerk_user_id, 'UTF8')),
    'hex'
  );

  SELECT *
  INTO v_existing
  FROM account_deletions
  WHERE clerk_user_id_hash = v_hash;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',
      CASE
        WHEN v_existing.completed_at IS NULL THEN 'pending'
        ELSE 'completed'
      END,
      'userId', v_existing.user_id
    );
  END IF;

  SELECT id
  INTO v_user_id
  FROM users
  WHERE clerk_user_id = p_clerk_user_id;

  IF v_user_id IS NULL THEN
    INSERT INTO users(clerk_user_id)
    VALUES (p_clerk_user_id)
    RETURNING id INTO v_user_id;
  END IF;

  -- Do not begin while an AI generation or billing operation
  -- is still holding an active lease.
  IF EXISTS (
    SELECT 1
    FROM smart_match_locks
    WHERE user_id = v_user_id
      AND expires_at > clock_timestamp()
  ) OR EXISTS (
    SELECT 1
    FROM billing_customers
    WHERE user_id = v_user_id
      AND sync_until > clock_timestamp()
  ) THEN
    RETURN jsonb_build_object(
      'status', 'busy',
      'userId', v_user_id
    );
  END IF;

  INSERT INTO account_deletions (
    user_id,
    clerk_user_id,
    clerk_user_id_hash
  )
  VALUES (
    v_user_id,
    p_clerk_user_id,
    v_hash
  );

  -- Suspend app access immediately.
  -- This is NOT confirmation that Stripe cancellation succeeded.
  UPDATE billing_customers
  SET risk_hold = true
  WHERE user_id = v_user_id;

  UPDATE billing_subscriptions
  SET premium = false,
      updated_at = clock_timestamp()
  WHERE stripe_customer_id IN (
    SELECT stripe_customer_id
    FROM billing_customers
    WHERE user_id = v_user_id
  );

  RETURN jsonb_build_object(
    'status', 'pending',
    'userId', v_user_id
  );
END;
$$;

--> statement-breakpoint

-- Called only after the backend has confirmed:
-- 1. Billing shutdown succeeded.
-- 2. Clerk account deletion succeeded.
CREATE FUNCTION account_deletion_finish(
  p_user_id uuid,
  p_owner uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_request account_deletions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(951714);

  SELECT *
  INTO v_request
  FROM account_deletions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_request.completed_at IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_request.lease_owner IS DISTINCT FROM p_owner
    OR v_request.lease_until IS NULL
    OR v_request.lease_until <= clock_timestamp()
    OR v_request.billing_stopped_at IS NULL
    OR v_request.clerk_deleted_at IS NULL
  THEN
    RETURN false;
  END IF;

  DELETE FROM saved_jobs
  WHERE user_id = p_user_id;

  DELETE FROM applications
  WHERE user_id = p_user_id;

  DELETE FROM smart_match_cache
  WHERE user_id = p_user_id;

  DELETE FROM smart_match_profiles
  WHERE user_id = p_user_id;

  DELETE FROM smart_match_locks
  WHERE user_id = p_user_id;

  UPDATE billing_subscriptions
  SET premium = false,
      updated_at = clock_timestamp()
  WHERE stripe_customer_id IN (
    SELECT stripe_customer_id
    FROM billing_customers
    WHERE user_id = p_user_id
  );

  -- Retain the internal database ID required by billing records,
  -- but remove its direct Clerk identity.
  UPDATE users
  SET clerk_user_id = 'deleted:' || p_user_id::text,
      updated_at = clock_timestamp()
  WHERE id = p_user_id;

  UPDATE account_deletions
  SET clerk_user_id = NULL,
      completed_at = clock_timestamp(),
      lease_owner = NULL,
      lease_until = NULL,
      last_error = NULL
  WHERE user_id = p_user_id;

  -- Billing references and AI accounting remain intact.
  -- Deletion must not reset global spending or erase reservations.
  RETURN true;
END;
$$;