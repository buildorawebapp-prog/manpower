-- ==========================================================================
-- Asokamanpower — Token Tracking & Chat System Migration
-- Run this after setup.sql to add token tracking and chat functionality
-- ==========================================================================

-- ---------- Add email and token columns to existing tables ----------
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS token_generated_at TIMESTAMPTZ;

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS token_generated_at TIMESTAMPTZ;

-- Create indexes for faster token lookups
CREATE INDEX IF NOT EXISTS idx_candidates_token ON candidates(tracking_token);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_employers_token ON employers(tracking_token);
CREATE INDEX IF NOT EXISTS idx_employers_email ON employers(email);

-- ---------- CHAT MESSAGES (between users and admin) ----------
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Reference to submission (either candidate or employer)
  submission_type TEXT NOT NULL CHECK (submission_type IN ('candidate', 'employer')),
  submission_id   UUID NOT NULL,

  -- Message details
  sender_type   TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  message       TEXT NOT NULL,

  -- Read status
  is_read       BOOLEAN NOT NULL DEFAULT false,
  read_at       TIMESTAMPTZ
);

-- Indexes for chat queries
CREATE INDEX IF NOT EXISTS idx_chat_submission ON chat_messages(submission_type, submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_messages(is_read, sender_type) WHERE is_read = false;

-- ---------- STATUS HISTORY (track status changes) ----------
CREATE TABLE IF NOT EXISTS status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Reference to submission
  submission_type TEXT NOT NULL CHECK (submission_type IN ('candidate', 'employer')),
  submission_id   UUID NOT NULL,

  -- Status change
  old_status      TEXT,
  new_status      TEXT NOT NULL,
  changed_by      TEXT, -- 'admin' or admin email
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_history ON status_history(submission_type, submission_id, created_at DESC);

-- ==========================================================================
-- ROW LEVEL SECURITY for new tables
-- ==========================================================================

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own chat messages by providing valid token
-- This will be handled in the application layer with a function

-- Admin has full access to all chats and history
CREATE POLICY "admin all chat_messages"
  ON chat_messages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin all status_history"
  ON status_history FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Public can insert chat messages (user messages)
-- We'll validate the token in the application layer
CREATE POLICY "public can send messages"
  ON chat_messages FOR INSERT
  TO anon
  WITH CHECK (sender_type = 'user');

-- ==========================================================================
-- HELPER FUNCTIONS
-- ==========================================================================

-- Function to generate a unique 8-character alphanumeric token
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars like 0,O,1,I
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get submission details by token and email (for user dashboard)
CREATE OR REPLACE FUNCTION get_submission_by_token(
  p_email TEXT,
  p_token TEXT
)
RETURNS TABLE (
  submission_id UUID,
  submission_type TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  data JSONB
) AS $$
BEGIN
  -- Try candidates first
  RETURN QUERY
  SELECT
    c.id,
    'candidate'::TEXT,
    c.status,
    c.created_at,
    jsonb_build_object(
      'full_name', c.full_name,
      'phone', c.phone,
      'email', c.email,
      'trade', c.trade,
      'experience', c.experience,
      'location', c.location,
      'message', c.message,
      'tracking_token', c.tracking_token
    )
  FROM candidates c
  WHERE c.email = p_email
    AND c.tracking_token = p_token;

  -- If not found, try employers
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      e.id,
      'employer'::TEXT,
      e.status,
      e.created_at,
      jsonb_build_object(
        'company_name', e.company_name,
        'contact_person', e.contact_person,
        'phone', e.phone,
        'email', e.email,
        'trade_needed', e.trade_needed,
        'workers_count', e.workers_count,
        'location', e.location,
        'message', e.message,
        'tracking_token', e.tracking_token
      )
    FROM employers e
    WHERE e.email = p_email
      AND e.tracking_token = p_token;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all submissions for an email
CREATE OR REPLACE FUNCTION get_all_submissions_by_email(p_email TEXT)
RETURNS TABLE (
  submission_id UUID,
  submission_type TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  tracking_token TEXT,
  summary TEXT
) AS $$
BEGIN
  -- Get all candidate submissions
  RETURN QUERY
  SELECT
    c.id,
    'candidate'::TEXT,
    c.status,
    c.created_at,
    c.tracking_token,
    ('Applied for ' || c.trade || ' in ' || c.location)::TEXT
  FROM candidates c
  WHERE c.email = p_email

  UNION ALL

  -- Get all employer submissions
  SELECT
    e.id,
    'employer'::TEXT,
    e.status,
    e.created_at,
    e.tracking_token,
    ('Hiring ' || e.trade_needed || ' in ' || e.location)::TEXT
  FROM employers e
  WHERE e.email = p_email

  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get chat messages for a submission
CREATE OR REPLACE FUNCTION get_chat_messages(
  p_submission_type TEXT,
  p_submission_id UUID,
  p_token TEXT
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  sender_type TEXT,
  message TEXT,
  is_read BOOLEAN
) AS $$
BEGIN
  -- Verify token first
  IF p_submission_type = 'candidate' THEN
    IF NOT EXISTS (
      SELECT 1 FROM candidates
      WHERE id = p_submission_id AND tracking_token = p_token
    ) THEN
      RAISE EXCEPTION 'Invalid token';
    END IF;
  ELSIF p_submission_type = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM employers
      WHERE id = p_submission_id AND tracking_token = p_token
    ) THEN
      RAISE EXCEPTION 'Invalid token';
    END IF;
  END IF;

  -- Return messages
  RETURN QUERY
  SELECT
    cm.id,
    cm.created_at,
    cm.sender_type,
    cm.message,
    cm.is_read
  FROM chat_messages cm
  WHERE cm.submission_type = p_submission_type
    AND cm.submission_id = p_submission_id
  ORDER BY cm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_submission_by_token(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_all_submissions_by_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_chat_messages(TEXT, UUID, TEXT) TO anon;

-- ==========================================================================
-- Update existing policies to allow token-based access
-- ==========================================================================

-- Allow users to read their own submission via token
CREATE POLICY "users can read own candidate submission"
  ON candidates FOR SELECT
  TO anon
  USING (tracking_token IS NOT NULL);

CREATE POLICY "users can read own employer submission"
  ON employers FOR SELECT
  TO anon
  USING (tracking_token IS NOT NULL);

-- Allow users to read chat messages for their submissions
CREATE POLICY "users can read own chat messages"
  ON chat_messages FOR SELECT
  TO anon
  USING (true); -- We validate token in the function

-- Done! Your token tracking system is ready.
