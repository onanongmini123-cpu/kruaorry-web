import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { fetchMembershipSchemaReadiness } from "@/lib/membershipSchemaReadiness";
import { buildPromptPayPayload } from "@/lib/promptpay";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

// PromptPay QR for the signed-in applicant's own pending application only.
// PROMPTPAY_ID and PROMPTPAY_ACCOUNT_NAME are server-only environment
// variables (never NEXT_PUBLIC_), so they are not in the browser bundle and
// are revealed only after this route has confirmed the application belongs to
// the caller. The amount is the server-quoted amount stored on the
// application, never a number sent by the browser.
export async function GET(request: Request) {
  const applicationId = new URL(request.url).searchParams.get("request") ?? "";
  if (!UUID.test(applicationId)) return json(400, { status: "bad_request" });

  const promptPayId = process.env.PROMPTPAY_ID;
  const accountName = (process.env.PROMPTPAY_ACCOUNT_NAME ?? "").trim();
  if (!promptPayId || !accountName) return json(200, { status: "not_configured" });

  try {
    const supabase = await createClient();
    const auth = await withTimeout(supabase.auth.getUser(), "promptpay auth");
    const authUser = auth.ok && !auth.value.error ? auth.value.data.user : null;
    if (!isPermanentAuthUser(authUser)) return json(401, { status: "unauthenticated" });
    if (await fetchMembershipSchemaReadiness(supabase) !== "ready") return json(503, { status: "unavailable" });

    const lookup = await withTimeout(Promise.resolve(supabase
      .from("upgrade_requests")
      .select("id, reference_code, plan_id, status, quoted_amount_thb")
      .eq("id", applicationId)
      .eq("user_id", authUser.id)
      .maybeSingle()), "promptpay application");
    if (!lookup.ok || lookup.value.error) return json(503, { status: "unavailable" });

    const row = lookup.value.data as { reference_code?: unknown; status?: unknown; quoted_amount_thb?: unknown } | null;
    if (!row || row.status !== "pending") return json(404, { status: "not_found" });
    const amount = Number(row.quoted_amount_thb);
    const payload = buildPromptPayPayload(promptPayId, amount);
    if (!payload || typeof row.reference_code !== "string") return json(503, { status: "unavailable" });

    const qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return json(200, { status: "ready", amountThb: amount, accountName, referenceCode: row.reference_code, qrSvg });
  } catch {
    return json(503, { status: "unavailable" });
  }
}
