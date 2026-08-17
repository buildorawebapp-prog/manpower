/* ==========================================================================
   Go Hire Consultancy — Configuration
   Loads sensitive data from environment variables (Vercel) or falls back
   to values in js/supabase.js for local development.
   ========================================================================== */

// For Vercel deployment, set these as Environment Variables in project settings:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY

const CONFIG = {
  // Supabase credentials
  supabaseUrl: typeof VERCEL_ENV !== 'undefined' && window.ENV?.SUPABASE_URL
    ? window.ENV.SUPABASE_URL
    : "https://srbudwxaxqfddwmwhobw.supabase.co",

  supabaseAnonKey: typeof VERCEL_ENV !== 'undefined' && window.ENV?.SUPABASE_ANON_KEY
    ? window.ENV.SUPABASE_ANON_KEY
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYnVkd3hheHFmZGR3bXdob2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjMzNDIsImV4cCI6MjA5OTkzOTM0Mn0.3io-O10VVafEv3Xe2qbNs0sP3c9gMy-b4g5QqCYpm7c",

  // Payment gateway
  razorpayKeyId: window.ENV?.RAZORPAY_KEY_ID || 'rzp_test_TQnucWOp8cFQo0', // Replace with your test key
};

// Note: Supabase ANON key is safe to expose in browser code.
// Your data is protected by Row Level Security (RLS) policies.
// NEVER put service_role key in frontend code.
