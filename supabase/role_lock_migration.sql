-- ==========================================================================
-- Go Hire Consultancy — One-Role-Per-Email Enforcement Migration
-- Run this in the Supabase SQL editor AFTER password_auth_migration_FIXED.sql
--
-- GOAL (secure, database-level):
--   An email registered as a CANDIDATE must NOT be usable to submit an
--   EMPLOYER request, and an email registered as an EMPLOYER must NOT be
--   usable to apply as a CANDIDATE.
--
-- HOW:
--   1) get_email_role()  — a SECURITY DEFINER helper so the browser can do a
--      friendly pre-check ("use another email") BEFORE any payment/insert.
--   2) BEFORE INSERT triggers on candidates & employers — the REAL guard.
--      These run inside the database and cannot be bypassed by the client,
--      even if someone calls the API directly or through create_payment_order.
--
-- Idempotent: safe to run more than once.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. ROLE LOOKUP  (friendly client-side pre-check)
-- --------------------------------------------------------------------------
-- Returns:
--   'candidate' -> email exists only in candidates
--   'employer'  -> email exists only in employers
--   'both'      -> email exists in both (legacy / anomalous data)
--   NULL        -> email not used yet (free to register in either role)
--
-- SECURITY DEFINER: the public site runs as the anon role, which has no
-- direct SELECT on these tables. Running as the definer lets the check see
-- every row. Matching is case-insensitive and trims whitespace.
CREATE OR REPLACE FUNCTION get_email_role(p_email TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email        TEXT := lower(trim(p_email));
  v_is_candidate BOOLEAN;
  v_is_employer  BOOLEAN;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM candidates WHERE lower(trim(email)) = v_email) INTO v_is_candidate;
  SELECT EXISTS (SELECT 1 FROM employers  WHERE lower(trim(email)) = v_email) INTO v_is_employer;

  IF v_is_candidate AND v_is_employer THEN
    RETURN 'both';
  ELSIF v_is_candidate THEN
    RETURN 'candidate';
  ELSIF v_is_employer THEN
    RETURN 'employer';
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- --------------------------------------------------------------------------
-- 2. TRIGGER FN: block an EMPLOYER email from being inserted as a CANDIDATE
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_single_role_candidate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM employers WHERE lower(trim(email)) = lower(trim(NEW.email))
    ) THEN
      RAISE EXCEPTION
        'ROLE_CONFLICT_EMPLOYER: This email is already registered as an employer. Please use a different email to apply as a candidate.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- --------------------------------------------------------------------------
-- 3. TRIGGER FN: block a CANDIDATE email from being inserted as an EMPLOYER
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_single_role_employer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM candidates WHERE lower(trim(email)) = lower(trim(NEW.email))
    ) THEN
      RAISE EXCEPTION
        'ROLE_CONFLICT_CANDIDATE: This email is already registered as a candidate. Please use a different email to submit an employer request.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- --------------------------------------------------------------------------
-- 4. ATTACH TRIGGERS  (drop-then-create for idempotency)
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_single_role_candidate ON candidates;
CREATE TRIGGER trg_single_role_candidate
  BEFORE INSERT ON candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_single_role_candidate();

DROP TRIGGER IF EXISTS trg_single_role_employer ON employers;
CREATE TRIGGER trg_single_role_employer
  BEFORE INSERT ON employers
  FOR EACH ROW EXECUTE FUNCTION enforce_single_role_employer();

-- --------------------------------------------------------------------------
-- 5. GRANTS
-- --------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_email_role(TEXT) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 6. DIAGNOSTIC: report any PRE-EXISTING dual-role emails (not modified)
-- --------------------------------------------------------------------------
-- Triggers only affect NEW inserts, so existing rows are left untouched.
-- This just lists emails that already exist in BOTH tables so you're aware.
DO $$
DECLARE
  r       RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN (
    SELECT DISTINCT lower(trim(c.email)) AS email
    FROM candidates c
    JOIN employers  e ON lower(trim(c.email)) = lower(trim(e.email))
    WHERE c.email IS NOT NULL AND btrim(c.email) <> ''
  )
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE 'Pre-existing dual-role email (candidate AND employer): %', r.email;
  END LOOP;

  RAISE NOTICE '========================================';
  IF v_count = 0 THEN
    RAISE NOTICE 'No pre-existing dual-role emails found. Clean!';
  ELSE
    RAISE NOTICE '% dual-role email(s) listed above (pre-existing, NOT modified).', v_count;
    RAISE NOTICE 'New submissions for those emails will now be blocked in both roles.';
  END IF;
  RAISE NOTICE 'One-role-per-email enforcement is now ACTIVE.';
  RAISE NOTICE '========================================';
END $$;
