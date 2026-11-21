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

export interface LineSlipAction {
  href: string;
  /** No OA ID is configured, so the message must be copied before LINE opens. */
  copyFirst: boolean;
}

/**
 * What the "open LINE" button does. With a configured OA ID the message is
 * already typed into the chat. Without one it opens the plain LINE link and
 * the page copies the message to the clipboard first, so the member can paste.
 */
export function lineSlipAction(oaId: unknown, message: LineSlipMessageInput): LineSlipAction {
  return { href: lineSlipHref(oaId, message), copyFirst: normalizeLineOaId(oaId) === null };
}
