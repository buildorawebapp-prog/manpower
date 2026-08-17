// ============================================================================
// Go Hire Consultancy — Edge Function: verify-razorpay-payment
// ----------------------------------------------------------------------------
// Verifies the Razorpay payment signature on the server and, ONLY when the
// signature is valid, finalizes the application (marks paid, activates the
// candidate, issues login credentials). This is the second half of the secure
// payment flow and the piece that closes the "anyone can mark themselves paid"
// hole.
//
// THE SIGNATURE:
//   Razorpay returns razorpay_signature = HMAC_SHA256(
//       "<razorpay_order_id>|<razorpay_payment_id>",  KEY_SECRET ).
//   The browser can NOT forge this because it never sees KEY_SECRET. We
//   recompute it here with the secret and compare. Mismatch => reject.
//
// SECRETS (set once via `supabase secrets set ...`):
//   RAZORPAY_KEY_SECRET        the Razorpay secret — NEVER put this in frontend
//   SUPABASE_URL               auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected by Supabase
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Hex HMAC-SHA256 using Web Crypto (built into Deno).
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison to avoid timing side-channels.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!KEY_SECRET) {
      return json({ success: false, error: "Razorpay secret is not configured on the server." }, 500);
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ success: false, error: "Supabase service role is not configured." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;

    if (!orderId || !paymentId || !signature) {
      return json({ success: false, error: "Missing payment fields." }, 400);
    }

    // ---- THE SECURITY GATE: verify the signature ----------------------------
    const expected = await hmacHex(KEY_SECRET, `${orderId}|${paymentId}`);
    if (!timingSafeEqual(expected, String(signature))) {
      return json({ success: false, error: "Payment signature verification failed." }, 400);
    }

    // ---- Signature valid → finalize via the existing RPC (service role) -----
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin.rpc("verify_payment", {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_signature: signature,
    });
    if (error) return json({ success: false, error: error.message }, 500);
    if (!data || data.success === false) {
      return json({ success: false, error: (data && data.error) || "Verification failed." }, 400);
    }

    // Passes { success, candidate_id, temp_password, email, full_name, amount } through.
    return json(data);
  } catch (e) {
    return json({ success: false, error: String((e && e.message) || e) }, 500);
  }
});
