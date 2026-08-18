-- ==========================================================================
-- Go Hire Consultancy — Migration: Admin Bulk Delete (users + ALL their data)
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (function is CREATE OR REPLACE, policy is dropped first).
--
-- WHAT THIS DOES
--   Adds ONE server-side function the admin dashboard calls to permanently
--   delete selected candidates / employers together with EVERYTHING attached
--   to them, in a single transaction (all-or-nothing):
--
--     • chat_messages      (all chat for that submission)
--     • status_history     (status change log)
--     • payments           (auto-removed by ON DELETE CASCADE on candidate_id)
--     • the candidate / employer row itself
--     • user_accounts       (login email+password) — ONLY when that email has
--                            no other candidate/employer submission left.
--
--   The function also RETURNS the file URLs (resume PDFs + chat images / PDFs /
--   videos) so the browser can delete the physical files from Storage right
--   after (SQL alone cannot reliably remove Storage objects).
--
-- SECURITY
--   SECURITY DEFINER → runs as the owner and bypasses RLS so it can clean up
--   every related table in one go. It is granted to `authenticated` ONLY
--   (in this project the authenticated role == the logged-in admin; public
--   site visitors use the anon role). anon / public CANNOT call it.
-- ==========================================================================

-- 1) The delete function ----------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_submissions(
  p_candidate_ids uuid[] DEFAULT '{}',
  p_employer_ids  uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resume_urls      text[];
  v_attachment_urls  text[];
  v_emails           text[];
  v_del_candidates   int := 0;
  v_del_employers    int := 0;
  v_del_accounts     int := 0;
BEGIN
  -- Nothing selected → do nothing (safety net).
  IF (p_candidate_ids IS NULL OR array_length(p_candidate_ids, 1) IS NULL)
     AND (p_employer_ids IS NULL OR array_length(p_employer_ids, 1) IS NULL) THEN
    RETURN jsonb_build_object(
      'resume_urls',        '[]'::jsonb,
      'attachment_urls',    '[]'::jsonb,
      'deleted_candidates', 0,
      'deleted_employers',  0,
      'deleted_accounts',   0
    );
  END IF;

  -- 1a) Collect resume file URLs from the selected candidates (BEFORE delete).
  SELECT array_agg(resume_url) INTO v_resume_urls
  FROM candidates
  WHERE id = ANY(p_candidate_ids)
    AND resume_url IS NOT NULL AND resume_url <> '';

  -- 1b) Collect chat attachment URLs (images / PDFs / videos) for BOTH types.
  SELECT array_agg(attachment_url) INTO v_attachment_urls
  FROM chat_messages
  WHERE attachment_url IS NOT NULL AND attachment_url <> ''
    AND (
      (submission_type = 'candidate' AND submission_id = ANY(p_candidate_ids))
      OR (submission_type = 'employer'  AND submission_id = ANY(p_employer_ids))
    );

  -- 1c) Collect the emails tied to these submissions (for orphan-account check).
  SELECT array_agg(DISTINCT email) INTO v_emails
  FROM (
    SELECT email FROM candidates
      WHERE id = ANY(p_candidate_ids) AND email IS NOT NULL AND email <> ''
    UNION
    SELECT email FROM employers
      WHERE id = ANY(p_employer_ids)  AND email IS NOT NULL AND email <> ''
  ) t;

  -- 2) Delete chat messages for these submissions.
  DELETE FROM chat_messages
  WHERE (submission_type = 'candidate' AND submission_id = ANY(p_candidate_ids))
     OR (submission_type = 'employer'  AND submission_id = ANY(p_employer_ids));

  -- 3) Delete status history for these submissions.
  DELETE FROM status_history
  WHERE (submission_type = 'candidate' AND submission_id = ANY(p_candidate_ids))
     OR (submission_type = 'employer'  AND submission_id = ANY(p_employer_ids));

  -- 4) Delete the candidate rows (payments auto-cascade via FK).
  WITH del AS (
    DELETE FROM candidates WHERE id = ANY(p_candidate_ids) RETURNING 1
  )
  SELECT count(*) INTO v_del_candidates FROM del;

  -- 5) Delete the employer rows.
  WITH del AS (
    DELETE FROM employers WHERE id = ANY(p_employer_ids) RETURNING 1
  )
  SELECT count(*) INTO v_del_employers FROM del;

  -- 6) Delete orphaned login accounts: only when that email now has NO
  --    remaining candidate OR employer submission. (One email can have several
  --    submissions; role-lock keeps an email out of both tables at once.)
  IF v_emails IS NOT NULL AND array_length(v_emails, 1) IS NOT NULL THEN
    WITH del AS (
      DELETE FROM user_accounts ua
      WHERE ua.email = ANY(v_emails)
        AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.email = ua.email)
        AND NOT EXISTS (SELECT 1 FROM employers  e WHERE e.email = ua.email)
      RETURNING 1
    )
    SELECT count(*) INTO v_del_accounts FROM del;
  END IF;

  -- 7) Hand the file URLs back so the browser can delete them from Storage.
  RETURN jsonb_build_object(
    'resume_urls',        to_jsonb(COALESCE(v_resume_urls,     ARRAY[]::text[])),
    'attachment_urls',    to_jsonb(COALESCE(v_attachment_urls, ARRAY[]::text[])),
    'deleted_candidates', v_del_candidates,
    'deleted_employers',  v_del_employers,
    'deleted_accounts',   v_del_accounts
  );
END;
$$;

-- 2) Lock it down: admin (authenticated) only -------------------------------
REVOKE ALL ON FUNCTION admin_delete_submissions(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_delete_submissions(uuid[], uuid[]) TO authenticated;

-- 3) Storage: let the admin delete resume files -----------------------------
--    (chat-attachments already has an admin DELETE policy from the video
--     migration; candidate-resumes did not have one until now.)
DROP POLICY IF EXISTS "admin delete resumes" ON storage.objects;
CREATE POLICY "admin delete resumes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'candidate-resumes');

-- Done! You should see "Success. No rows returned".
-- Quick check (optional):
--   SELECT proname FROM pg_proc WHERE proname = 'admin_delete_submissions';
