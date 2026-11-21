// PromptPay (EMVCo "Thai QR Payment") payload builder. No payment gateway is
// involved: the payload only tells a banking app who to pay and how much, and
// the member still transfers money and sends the slip by LINE.

export type PromptPayProxy = { kind: "phone" | "nationalId" | "eWallet"; value: string };

const PROMPTPAY_AID = "A000000677010111";

/** Accepts a phone number (08x-xxx-xxxx), a 13-digit national/tax ID, or a 15-digit e-wallet ID. */
export function parsePromptPayId(raw: unknown): PromptPayProxy | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 10 && digits.startsWith("0")) return { kind: "phone", value: `0066${digits.slice(1)}` };
  if (digits.length === 11 && digits.startsWith("66")) return { kind: "phone", value: `00${digits}` };
  if (digits.length === 13 && digits.startsWith("0066")) return { kind: "phone", value: digits };
  if (digits.length === 13) return { kind: "nationalId", value: digits };
  if (digits.length === 15) return { kind: "eWallet", value: digits };
  return null;
}

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as the EMVCo spec requires. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Builds a dynamic PromptPay payload for an exact amount in THB.
 * Returns null for an invalid ID or an amount that is not a positive number
 * with at most two decimals (the QR must never carry a guessed amount).
 */
export function buildPromptPayPayload(promptPayId: unknown, amountThb: number): string | null {
  const proxy = parsePromptPayId(promptPayId);
  if (!proxy) return null;
  if (!Number.isFinite(amountThb) || amountThb <= 0 || amountThb > 9_999_999.99) return null;
  if (Math.round(amountThb * 100) / 100 !== amountThb) return null;

  const proxyTag = proxy.kind === "phone" ? "01" : proxy.kind === "nationalId" ? "02" : "03";
  const body = [
    field("00", "01"),
    field("01", "12"),
    field("29", field("00", PROMPTPAY_AID) + field(proxyTag, proxy.value)),
    field("53", "764"),
    field("54", amountThb.toFixed(2)),
    field("58", "TH"),
  ].join("");
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${crc16(withCrcHeader)}`;
}
