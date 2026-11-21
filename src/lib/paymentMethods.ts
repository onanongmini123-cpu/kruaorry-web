// Which transfer methods the payment step shows. Pure functions so the three
// cases (PromptPay + bank account / bank account only / neither) are tested.

export interface QrPayment { amountThb: number; accountName: string; referenceCode: string; qrSvg: string }
export interface BankPayment { bankName: string; accountNumber: string; accountName: string; amountThb: number; referenceCode: string }

export type MethodState<T> =
  | { status: "loading" }
  | { status: "not_configured" }
  | { status: "unavailable" }
  | ({ status: "ready" } & T);

export type PaymentView =
  | { kind: "loading" }
  /** Neither method is configured: tell the member to ask for details on LINE. */
  | { kind: "line_only" }
  /** A method that should have worked could not be shown (and none could). */
  | { kind: "unavailable" }
  | { kind: "ready"; qr: QrPayment | null; bank: BankPayment | null; amountThb: number; referenceCode: string; partialFailure: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export function parseQrResponse(body: unknown): MethodState<QrPayment> {
  if (!isRecord(body)) return { status: "unavailable" };
  if (body.status === "not_configured") return { status: "not_configured" };
  if (body.status === "ready" && typeof body.qrSvg === "string" && typeof body.amountThb === "number"
    && typeof body.accountName === "string" && typeof body.referenceCode === "string") {
    return { status: "ready", amountThb: body.amountThb, accountName: body.accountName, referenceCode: body.referenceCode, qrSvg: body.qrSvg };
  }
  return { status: "unavailable" };
}

export function parseBankResponse(body: unknown): MethodState<BankPayment> {
  if (!isRecord(body)) return { status: "unavailable" };
  if (body.status === "not_configured") return { status: "not_configured" };
  if (body.status === "ready" && typeof body.bankName === "string" && typeof body.accountNumber === "string"
    && typeof body.accountName === "string" && typeof body.amountThb === "number" && typeof body.referenceCode === "string") {
    return { status: "ready", bankName: body.bankName, accountNumber: body.accountNumber, accountName: body.accountName, amountThb: body.amountThb, referenceCode: body.referenceCode };
  }
  return { status: "unavailable" };
}

export interface ExpectedPayment { amountThb: number; referenceCode: string }

/**
 * `expected` is the amount and reference of the application the page is
 * showing. A method that answers with anything else is stale (for example the
 * quote was just changed): show nothing rather than a mismatching amount.
 */
export function resolvePaymentView(qr: MethodState<QrPayment>, bank: MethodState<BankPayment>, expected?: ExpectedPayment): PaymentView {
  if (qr.status === "loading" || bank.status === "loading") return { kind: "loading" };
  const qrReady = qr.status === "ready" ? qr : null;
  const bankReady = bank.status === "ready" ? bank : null;

  if (!qrReady && !bankReady) {
    return qr.status === "unavailable" || bank.status === "unavailable" ? { kind: "unavailable" } : { kind: "line_only" };
  }
  // Both answers come from the same application. If they ever disagree, show
  // nothing rather than two different amounts or references.
  if (qrReady && bankReady && (qrReady.amountThb !== bankReady.amountThb || qrReady.referenceCode !== bankReady.referenceCode)) {
    return { kind: "unavailable" };
  }
  const source = (bankReady ?? qrReady)!;
  if (expected && (source.amountThb !== expected.amountThb || source.referenceCode !== expected.referenceCode)) {
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    qr: qrReady ? { amountThb: qrReady.amountThb, accountName: qrReady.accountName, referenceCode: qrReady.referenceCode, qrSvg: qrReady.qrSvg } : null,
    bank: bankReady ? { bankName: bankReady.bankName, accountNumber: bankReady.accountNumber, accountName: bankReady.accountName, amountThb: bankReady.amountThb, referenceCode: bankReady.referenceCode } : null,
    amountThb: source.amountThb,
    referenceCode: source.referenceCode,
    partialFailure: qr.status === "unavailable" || bank.status === "unavailable",
  };
}
