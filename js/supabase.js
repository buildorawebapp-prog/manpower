/* ==========================================================================
   Go Hire Consultancy — Supabase config
   The anon (public) key is SAFE to expose in the browser — your data is
   protected by Row Level Security (see supabase/setup.sql).
   NEVER put the service_role key here.

   For production: Set environment variables in Vercel dashboard, then
   update config.js to load from window.ENV
   ========================================================================== */

// Local development fallback — production uses config.js + Vercel env vars
const SUPABASE_URL = typeof CONFIG !== 'undefined' && CONFIG.supabaseUrl
  ? CONFIG.supabaseUrl
  : "https://srbudwxaxqfddwmwhobw.supabase.co";

const SUPABASE_ANON_KEY = typeof CONFIG !== 'undefined' && CONFIG.supabaseAnonKey
  ? CONFIG.supabaseAnonKey
  : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYnVkd3hheHFmZGR3bXdob2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjMzNDIsImV4cCI6MjA5OTkzOTM0Mn0.3io-O10VVafEv3Xe2qbNs0sP3c9gMy-b4g5QqCYpm7c";

// Created after the supabase-js library loads (see each page's <script> tags).
let sb = null;
function initSupabase() {
  if (!sb && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sb;
}
