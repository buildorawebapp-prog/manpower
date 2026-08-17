-- ==========================================================================
-- Go Hire Consultancy — Admin "Reset User Password" Migration
-- Run this in the Supabase SQL editor AFTER password_auth_migration_FIXED.sql
--
-- GOAL: When a candidate/employer forgets their password, an admin clicks
-- "Reset Password" in the admin panel. The database issues a fresh temporary
-- password, forces a change on next login (is_temp_password = true), and
-- returns the plaintext temp password ONCE so the admin can send it to the
-- user over WhatsApp. Works for candidates and employers alike (both share the
-- same user_accounts login identity, keyed by email).
--
-- SECURITY: admins are the ONLY users who authenticate via Supabase Auth in
-- this app (the public site runs as the anon role with custom sessionStorage
-- auth). So execute rights are granted to the `authenticated` role only, and
-- explicitly revoked from anon/public — the anon key CANNOT call this.
--
-- NOTE ON search_path: this function calls hash_password() which uses
-- pgcrypto's digest(). In Supabase, pgcrypto lives in the `extensions` schema,
-- so `extensions` MUST be in search_path or you get
-- "function digest(text, unknown) does not exist". Do not drop it.
--
-- Idempotent: safe to run more than once.
-- ==========================================================================

CREATE OR REPLACE FUNCTION admin_reset_user_password(p_email TEXT)
RETURNS TABLE (
  success       BOOLEAN,
  message       TEXT,
  temp_password TEXT
) AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_user_id UUID;
  v_temp    TEXT;
  v_message TEXT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT false, 'No email on this record, so there is no login account to reset.'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM user_accounts WHERE lower(trim(email)) = v_email;

  -- Fresh temporary password (reuses the same generator as signup so the
  -- first-login "change password" flow behaves identically).
  v_temp := generate_temp_password();

  IF v_user_id IS NULL THEN
    -- No account yet (e.g. very old submission) — create one so the user can
    -- actually log in with the temp password.
    INSERT INTO user_accounts (email, password_hash, is_temp_password)
    VALUES (v_email, hash_password(v_temp), true)
    RETURNING id INTO v_user_id;
    v_message := 'New login account created with a temporary password.';
  ELSE
    UPDATE user_accounts
    SET password_hash    = hash_password(v_temp),
        is_temp_password = true
    WHERE id = v_user_id;
    v_message := 'Password reset. The old password no longer works.';
  END IF;

  -- Defensive: make sure this person's submissions are linked to the account
  -- so they appear on their dashboard after logging in.
  UPDATE candidates SET user_id = v_user_id
    WHERE lower(trim(email)) = v_email AND user_id IS NULL;
  UPDATE employers  SET user_id = v_user_id
    WHERE lower(trim(email)) = v_email AND user_id IS NULL;

  RETURN QUERY SELECT true, v_message, v_temp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

-- Lock down execution to admins (authenticated) only.
REVOKE ALL ON FUNCTION admin_reset_user_password(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_reset_user_password(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION admin_reset_user_password(TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- Verify
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_exists INT;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM pg_proc WHERE proname = 'admin_reset_user_password';
  RAISE NOTICE '========================================';
  IF v_exists > 0 THEN
    RAISE NOTICE 'admin_reset_user_password() is installed and admin-only.';
  ELSE
    RAISE NOTICE 'WARNING: function was not created.';
  END IF;
  RAISE NOTICE '========================================';
END $$;
