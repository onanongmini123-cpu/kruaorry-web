import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { APPLICATION_ID_PATTERN, loadOwnPendingApplication } from "@/lib/membershipPaymentLookup";
import { buildPromptPayPayload } from "@/lib/promptpay";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };

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
  if (!APPLICATION_ID_PATTERN.test(applicationId)) return json(400, { status: "bad_request" });

  const promptPayId = process.env.PROMPTPAY_ID;
  const accountName = (process.env.PROMPTPAY_ACCOUNT_NAME ?? "").trim();
  if (!promptPayId || !accountName) return json(200, { status: "not_configured" });

  const application = await loadOwnPendingApplication(applicationId);
  if (!application.ok) return json(application.httpStatus, { status: application.status });

  try {
    const amount = application.amountThb;
    const payload = buildPromptPayPayload(promptPayId, amount);
    if (!payload) return json(503, { status: "unavailable" });

    const qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return json(200, { status: "ready", amountThb: amount, accountName, referenceCode: application.referenceCode, qrSvg });
  } catch {
    return json(503, { status: "unavailable" });
  }
}
