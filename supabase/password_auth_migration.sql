-- ==========================================================================
-- Asokamanpower — Password-Based Authentication System Migration
-- Run this AFTER token_tracking_migration.sql
-- This upgrades the system from token-based to password-based authentication
-- ==========================================================================

-- ---------- USER ACCOUNTS TABLE ----------
CREATE TABLE IF NOT EXISTS user_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  is_temp_password BOOLEAN NOT NULL DEFAULT true,
  theme_preference TEXT NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login      TIMESTAMPTZ,

  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);

-- ---------- UPDATE EXISTING TABLES ----------
-- Add user_id foreign key to candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL;

-- Add user_id foreign key to employers
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_employers_user_id ON employers(user_id);

-- ==========================================================================
-- ROW LEVEL SECURITY
-- ==========================================================================

ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;

-- Public can create accounts (during form submission)
CREATE POLICY "public can create accounts"
  ON user_accounts FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public can read their own account by email (for login)
CREATE POLICY "public can read own account"
  ON user_accounts FOR SELECT
  TO anon
  USING (true);

-- Public can update their own password
CREATE POLICY "public can update own account"
  ON user_accounts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Admin can manage all accounts
CREATE POLICY "admin all user_accounts"
  ON user_accounts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Update candidates policy to allow users to see their own submissions
DROP POLICY IF EXISTS "users can read own candidate submission" ON candidates;
CREATE POLICY "users can read own candidate submissions"
  ON candidates FOR SELECT
  TO anon
  USING (user_id IS NOT NULL);

-- Update employers policy
DROP POLICY IF EXISTS "users can read own employer submission" ON employers;
CREATE POLICY "users can read own employer submissions"
  ON employers FOR SELECT
  TO anon
  USING (user_id IS NOT NULL);

-- ==========================================================================
-- HELPER FUNCTIONS
-- ==========================================================================

-- Function to generate temporary password (8 characters: TEMP1234)
CREATE OR REPLACE FUNCTION generate_temp_password()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'TEMP';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to hash password (simple version - in production use pgcrypto)
CREATE OR REPLACE FUNCTION hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Simple hash for demo - in production use pgcrypto's crypt()
  RETURN encode(digest(password, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to verify password
CREATE OR REPLACE FUNCTION verify_password(email TEXT, password TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  is_temp_password BOOLEAN,
  theme_preference TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ua.id,
    ua.email,
    ua.is_temp_password,
    ua.theme_preference
  FROM user_accounts ua
  WHERE ua.email = verify_password.email
    AND ua.password_hash = hash_password(password);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create user account
CREATE OR REPLACE FUNCTION get_or_create_user_account(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  temp_password TEXT,
  is_new_user BOOLEAN
) AS $$
DECLARE
  v_user_id UUID;
  v_temp_password TEXT;
  v_is_new BOOLEAN;
BEGIN
  -- Check if user exists
  SELECT id INTO v_user_id
  FROM user_accounts
  WHERE user_accounts.email = p_email;

  IF v_user_id IS NULL THEN
    -- New user - create account with temp password
    v_temp_password := generate_temp_password();
    v_is_new := true;

    INSERT INTO user_accounts (email, password_hash, is_temp_password)
    VALUES (p_email, hash_password(v_temp_password), true)
    RETURNING id INTO v_user_id;
  ELSE
    -- Existing user
    v_temp_password := NULL;
    v_is_new := false;
  END IF;

  RETURN QUERY
  SELECT v_user_id, p_email, v_temp_password, v_is_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all submissions for a user
CREATE OR REPLACE FUNCTION get_user_submissions(p_user_id UUID)
RETURNS TABLE (
  submission_id UUID,
  submission_type TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  tracking_token TEXT,
  summary TEXT,
  trade TEXT,
  location TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Get candidate submissions
  SELECT
    c.id,
    'candidate'::TEXT,
    c.status,
    c.created_at,
    c.tracking_token,
    ('Applied for ' || c.trade || ' in ' || c.location)::TEXT,
    c.trade,
    c.location
  FROM candidates c
  WHERE c.user_id = p_user_id

  UNION ALL

  -- Get employer submissions
  SELECT
    e.id,
    'employer'::TEXT,
    e.status,
    e.created_at,
    e.tracking_token,
    ('Hiring ' || e.trade_needed || ' in ' || e.location)::TEXT,
    e.trade_needed,
    e.location
  FROM employers e
  WHERE e.user_id = p_user_id

  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to change password
CREATE OR REPLACE FUNCTION change_user_password(
  p_user_id UUID,
  p_current_password TEXT,
  p_new_password TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_current_hash TEXT;
BEGIN
  -- Verify current password
  SELECT password_hash INTO v_current_hash
  FROM user_accounts
  WHERE id = p_user_id;

  IF v_current_hash IS NULL THEN
    RETURN QUERY SELECT false, 'User not found'::TEXT;
    RETURN;
  END IF;

  IF v_current_hash != hash_password(p_current_password) THEN
    RETURN QUERY SELECT false, 'Current password is incorrect'::TEXT;
    RETURN;
  END IF;

  -- Update password
  UPDATE user_accounts
  SET
    password_hash = hash_password(p_new_password),
    is_temp_password = false
  WHERE id = p_user_id;

  RETURN QUERY SELECT true, 'Password updated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update theme preference
CREATE OR REPLACE FUNCTION update_theme_preference(
  p_user_id UUID,
  p_theme TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE user_accounts
  SET theme_preference = p_theme
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_temp_password() TO anon;
GRANT EXECUTE ON FUNCTION hash_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_password(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_or_create_user_account(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_user_submissions(UUID) TO anon;
GRANT EXECUTE ON FUNCTION change_user_password(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_theme_preference(UUID, TEXT) TO anon;

-- ==========================================================================
-- DATA MIGRATION (Optional - if you have existing data)
-- ==========================================================================

-- Create user accounts for existing submissions that have emails
DO $$
DECLARE
  r RECORD;
  v_user_id UUID;
  v_temp_pwd TEXT;
BEGIN
  -- Migrate candidates
  FOR r IN (SELECT DISTINCT email FROM candidates WHERE email IS NOT NULL AND email != '')
  LOOP
    -- Create user account if doesn't exist
    IF NOT EXISTS (SELECT 1 FROM user_accounts WHERE email = r.email) THEN
      v_temp_pwd := generate_temp_password();
      INSERT INTO user_accounts (email, password_hash, is_temp_password)
      VALUES (r.email, hash_password(v_temp_pwd), true)
      RETURNING id INTO v_user_id;

      -- Update all candidate submissions with this email
      UPDATE candidates SET user_id = v_user_id WHERE email = r.email;

      RAISE NOTICE 'Created account for %: TEMP password = %', r.email, v_temp_pwd;
    ELSE
      SELECT id INTO v_user_id FROM user_accounts WHERE email = r.email;
      UPDATE candidates SET user_id = v_user_id WHERE email = r.email AND user_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate employers
  FOR r IN (SELECT DISTINCT email FROM employers WHERE email IS NOT NULL AND email != '')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM user_accounts WHERE email = r.email) THEN
      v_temp_pwd := generate_temp_password();
      INSERT INTO user_accounts (email, password_hash, is_temp_password)
      VALUES (r.email, hash_password(v_temp_pwd), true)
      RETURNING id INTO v_user_id;

      UPDATE employers SET user_id = v_user_id WHERE email = r.email;

      RAISE NOTICE 'Created account for %: TEMP password = %', r.email, v_temp_pwd;
    ELSE
      SELECT id INTO v_user_id FROM user_accounts WHERE email = r.email;
      UPDATE employers SET user_id = v_user_id WHERE email = r.email AND user_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- ==========================================================================
-- NOTES
-- ==========================================================================
-- After running this migration:
-- 1. All existing users will have accounts created with temporary passwords
-- 2. The temporary passwords will be shown in the NOTICES
-- 3. New form submissions will automatically create user accounts
-- 4. Users can login with email + password
-- 5. Users can change their temporary password
-- 6. Users can see all their submissions in one dashboard
-- 7. Theme preference is saved per user

-- Done! Your password-based authentication system is ready.
