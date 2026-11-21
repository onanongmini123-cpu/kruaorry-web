import { LINE_OA_URL } from "@/lib/config";

/** LINE Official Account IDs look like "@abc1234d". Anything else is ignored. */
export function normalizeLineOaId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^@[A-Za-z0-9._-]{2,40}$/.test(id) ? id : null;
}

export interface LineSlipMessageInput {
  planName: string;
  referenceCode: string;
  amountThb: number;
}

export function lineSlipMessage({ planName, referenceCode, amountThb }: LineSlipMessageInput): string {
  return `ส่งสลิปสมัคร ${planName} เลขอ้างอิง ${referenceCode} ยอด ${amountThb} บาท`;
}

/**
 * The LINE chat link with the slip message already typed in. When the OA ID is
 * not configured yet (or is malformed) it falls back to the plain LINE link so
 * the button never breaks.
 */
export function lineSlipHref(oaId: unknown, message: LineSlipMessageInput): string {
  const id = normalizeLineOaId(oaId);
  if (!id) return LINE_OA_URL;
  return `https://line.me/R/oaMessage/${id}/?${encodeURIComponent(lineSlipMessage(message))}`;
}
