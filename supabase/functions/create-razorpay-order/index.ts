// ============================================================================
// Go Hire Consultancy — Edge Function: create-razorpay-order
// ----------------------------------------------------------------------------
// Creates a REAL Razorpay order on the server, using the Razorpay SECRET key
// (which never touches the browser). This is the first half of the secure
// payment flow.
//
// WHY THIS EXISTS:
//   The old flow opened Razorpay Checkout WITHOUT a server order_id and let the
//   browser call verify_payment() directly. With no server order and no
//   signature check, anyone could mark themselves "paid" without paying. Real
//   money needs a server-created order + a signature we can verify later.
//
// WHAT IT DOES:
//   1. Role lock — blocks an email already registered as an EMPLOYER.
//   2. Calls the existing create_payment_order() RPC to insert the candidate +
//      a payments row (temporarily keyed by a local receipt id).
//   3. Creates a genuine Razorpay Order via the Orders API.
//   4. Re-keys the payments row to the real Razorpay order id.
//   5. Returns { order_id, amount, currency, candidate_id, key_id }.
//
// SECRETS (set once via `supabase secrets set ...`):
//   RAZORPAY_KEY_ID            e.g. rzp_live_xxx  (publishable id)
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

const ROLE_CONFLICT_MSG =
  "This email is already registered as an employer account. Please use a different email to apply as a candidate.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!KEY_ID || !KEY_SECRET) {
      return json(
        { success: false, error: "Razorpay keys are not configured on the server." },
        500,
      );
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(
        { success: false, error: "Supabase service role is not configured." },
        500,
      );
    }

    const parsed = await req.json().catch(() => null);
    const candidateData = parsed && parsed.candidateData;
    if (!candidateData || !candidateData.email || !candidateData.full_name) {
      return json({ success: false, error: "Missing candidate data." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ---- 1) Role lock: block an email already registered as an employer -----
    const email = String(candidateData.email).trim().toLowerCase();
    try {
      const { data: role, error: roleErr } = await admin.rpc("get_email_role", {
        p_email: email,
      });
      if (!roleErr && (role === "employer" || role === "both")) {
        return json({ success: false, code: "ROLE_CONFLICT", error: ROLE_CONFLICT_MSG }, 409);
      }
    } catch (_) {
      // Non-blocking: the DB trigger inside create_payment_order is the real guard.
    }

    // ---- 2) Insert candidate + payments row via the existing RPC ------------
    const { data: created, error: createErr } = await admin.rpc("create_payment_order", {
      p_candidate_data: candidateData,
    });
    if (createErr) {
      const m = createErr.message || "";
      if (m.indexOf("ROLE_CONFLICT") !== -1) {
        return json({ success: false, code: "ROLE_CONFLICT", error: ROLE_CONFLICT_MSG }, 409);
      }
      return json({ success: false, error: m || "Failed to save application." }, 500);
    }
    // create_payment_order returns { receipt_id, amount, candidate_id, currency }
    // on success, or { success:false, error } if its internal handler fired.
    if (!created || created.success === false || !created.candidate_id) {
      const m = created && created.error ? String(created.error) : "Failed to save application.";
      if (m.indexOf("ROLE_CONFLICT") !== -1) {
        return json({ success: false, code: "ROLE_CONFLICT", error: ROLE_CONFLICT_MSG }, 409);
      }
      return json({ success: false, error: m }, 500);
    }

    const candidateId: string = created.candidate_id;
    const receiptId: string = created.receipt_id;
    const amount: number = typeof created.amount === "number" ? created.amount : 20000;

    // ---- 3) Create a REAL Razorpay order ------------------------------------
    const auth = "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`);
    const orderResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount, // paise (20000 = ₹200)
        currency: "INR",
        receipt: receiptId,
        notes: { candidate_id: candidateId },
      }),
    });
    const order = await orderResp.json().catch(() => null);
    if (!orderResp.ok || !order || !order.id) {
      const desc = (order && order.error && order.error.description) ||
        "Could not create Razorpay order. Check the server keys / KYC status.";
      return json({ success: false, error: desc }, 502);
    }

    // ---- 4) Re-key the payments row to the real Razorpay order id -----------
    // We MUST confirm exactly one row was updated. If it silently updates zero
    // rows, the payments row keeps the local receipt id and verify_payment would
    // never find it after the user pays — stranding a paying customer. Fail here
    // (before Checkout opens) so no money is taken against an unverifiable order.
    const { data: upData, error: upErr } = await admin
      .from("payments")
      .update({ razorpay_order_id: order.id })
      .eq("razorpay_order_id", receiptId)
      .select("id");
    if (upErr) {
      return json({ success: false, error: "Failed to attach order: " + upErr.message }, 500);
    }
    if (!upData || upData.length !== 1) {
      return json({ success: false, error: "Could not attach the order to a payment record. Please retry." }, 500);
    }

    // ---- 5) Done — the browser opens Checkout with this real order_id -------
    return json({
      success: true,
      order_id: order.id,
      amount,
      currency: "INR",
      candidate_id: candidateId,
      key_id: KEY_ID,
    });
  } catch (e) {
    return json({ success: false, error: String((e && e.message) || e) }, 500);
  }
});
