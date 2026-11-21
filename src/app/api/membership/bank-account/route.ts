import { NextResponse } from "next/server";
import { readBankAccountConfig } from "@/lib/bankAccount";
import { APPLICATION_ID_PATTERN, loadOwnPendingApplication } from "@/lib/membershipPaymentLookup";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

// Bank account for the signed-in applicant's own pending application only.
// BANK_NAME, BANK_ACCOUNT_NUMBER and BANK_ACCOUNT_NAME are server-only
// environment variables (never NEXT_PUBLIC_): they are not in the page's HTML
// or JavaScript and are revealed only after the application has been confirmed
// as the caller's own and still pending. The amount is the server-quoted
// amount stored on the application, never a number sent by the browser.
export async function GET(request: Request) {
  const applicationId = new URL(request.url).searchParams.get("request") ?? "";
  if (!APPLICATION_ID_PATTERN.test(applicationId)) return json(400, { status: "bad_request" });

  const bank = readBankAccountConfig();
  if (!bank) return json(200, { status: "not_configured" });

  const application = await loadOwnPendingApplication(applicationId);
  if (!application.ok) return json(application.httpStatus, { status: application.status });

  return json(200, {
    status: "ready",
    bankName: bank.bankName,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
    amountThb: application.amountThb,
    referenceCode: application.referenceCode,
  });
}
