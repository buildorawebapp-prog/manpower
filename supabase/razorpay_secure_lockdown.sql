-- ============================================================================
-- Go Hire Consultancy — Razorpay Secure Lockdown
-- Run this in the Supabase SQL editor AFTER deploying BOTH Edge Functions
-- (create-razorpay-order and verify-razorpay-payment) and updating the site.
--
-- WHY:
--   Previously create_payment_order() and verify_payment() were granted to the
--   `anon` role. The anon key ships in the browser, so anyone could call
--   verify_payment() directly and mark themselves "paid" WITHOUT paying —
--   verify_payment does NO signature check. The real HMAC signature check now
--   lives inside the verify-razorpay-payment Edge Function (which alone holds
--   the Razorpay secret). We now let ONLY the service_role call these two
--   functions, so the browser bypass is gone.
--
--   After this runs, the ONLY way to create an order or verify a payment is
--   through the Edge Functions (they authenticate as service_role).
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---- create_payment_order(JSONB) -----------------------------------------
REVOKE ALL ON FUNCTION create_payment_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_payment_order(JSONB) FROM anon;
REVOKE ALL ON FUNCTION create_payment_order(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_payment_order(JSONB) TO service_role;

-- ---- verify_payment(TEXT, TEXT, TEXT) ------------------------------------
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO service_role;

-- --------------------------------------------------------------------------
-- Verify: anon and authenticated should NO LONGER be able to call these.
-- (Supabase's SQL editor may not show RAISE NOTICE output — that is normal.
--  The SELECT below returns a clear TRUE/FALSE table you can read directly.)
-- --------------------------------------------------------------------------
SELECT
  has_function_privilege('anon',          'create_payment_order(jsonb)',        'EXECUTE') AS anon_create_order,
  has_function_privilege('anon',          'verify_payment(text,text,text)',     'EXECUTE') AS anon_verify_payment,
  has_function_privilege('authenticated', 'create_payment_order(jsonb)',        'EXECUTE') AS auth_create_order,
  has_function_privilege('authenticated', 'verify_payment(text,text,text)',     'EXECUTE') AS auth_verify_payment,
  has_function_privilege('service_role',  'create_payment_order(jsonb)',        'EXECUTE') AS service_create_order,
  has_function_privilege('service_role',  'verify_payment(text,text,text)',     'EXECUTE') AS service_verify_payment;
-- EXPECTED: the four anon_/auth_ columns = FALSE, the two service_ columns = TRUE.
