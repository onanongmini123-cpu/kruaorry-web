// Pure parsing of Thai accounting messages sent over LINE. No I/O, no guessing:
// when something is unclear the result says so and nothing is recorded.

export type Channel = "kruaorry_com" | "facebook_vip" | "digital_products" | "other";

export type Parsed =
  | { kind: "entry"; type: "income" | "expense"; amount: number; description: string;
      accountCode: number | null; channel: Channel | null }
  | { kind: "decision"; decision: "approved" | "rejected"; ref: string }
  | { kind: "query"; query: "expenses_today" | "profit_month" | "anomalies" | "pending" }
  | { kind: "unclear"; reason: string };

const EXPENSE_START = /^(จ่าย|ซื้อ|ชำระ|ค่า|โอนจ่าย)/;
const INCOME_START = /^(รับเงิน|รับ|ขาย|ได้รับ)/;

// Order matters: first match wins.
const RULES: { re: RegExp; code: number; channel?: Channel }[] = [
  { re: /โฆษณา|ads?\b|ยิงแอด/i, code: 6100 },
  { re: /canva|subscription|software|โปรแกรม|domain|โดเมน|hosting|vercel|supabase/i, code: 6000 },
  { re: /อุปกรณ์|สำนักงาน/, code: 6200 },
  { re: /ค่าธรรมเนียม|ค่าแพลตฟอร์ม|fee/i, code: 6300 },
  { re: /vip|กลุ่มใบงาน/i, code: 4100, channel: "facebook_vip" },
  { re: /teacher\s*pro|สมาชิก|kruaorry/i, code: 4000, channel: "kruaorry_com" },
  { re: /ไฟล์ดิจิทัล|digital|ใบงาน/i, code: 4200, channel: "digital_products" },
];

export function parseAmount(text: string): number | null {
  const withUnit = text.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|฿|thb)/i);
  const candidates = withUnit ? [withUnit[1]] : [...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].map((m) => m[0]);
  if (candidates.length !== 1) return null; // none or ambiguous
  const n = Number(candidates[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseMessage(raw: string): Parsed {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "unclear", reason: "ข้อความว่าง" };

  const decision = text.match(/^(ยืนยัน|อนุมัติ|ปฏิเสธ)\s+([A-Z]{3}-\d{6}-\d{6})$/i);
  if (decision) {
    return { kind: "decision", decision: decision[1] === "ปฏิเสธ" ? "rejected" : "approved",
             ref: decision[2].toUpperCase() };
  }

  if (/^สรุป/.test(text)) {
    if (/รายจ่าย.*วันนี้/.test(text)) return { kind: "query", query: "expenses_today" };
    if (/กำไร.*เดือน/.test(text)) return { kind: "query", query: "profit_month" };
    return { kind: "unclear", reason: "ยังไม่รองรับคำสั่งสรุปนี้" };
  }
  if (/ตรวจสอบรายการผิดปกติ/.test(text)) return { kind: "query", query: "anomalies" };
  if (/รายการรออนุมัติ|ค้างอนุมัติ/.test(text)) return { kind: "query", query: "pending" };

  const type = EXPENSE_START.test(text) ? "expense" : INCOME_START.test(text) ? "income" : null;
  if (!type) return { kind: "unclear", reason: "ไม่ทราบว่าเป็นรายรับหรือรายจ่าย" };

  const amount = parseAmount(text);
  if (amount === null) return { kind: "unclear", reason: "ไม่พบจำนวนเงิน หรือมีตัวเลขหลายค่า กรุณาระบุจำนวนเงินเป็นบาท" };

  const rule = RULES.find((r) => r.re.test(text));
  const matchesType = rule && ((type === "income") === (rule.code >= 4000 && rule.code < 5000));
  return {
    kind: "entry", type, amount, description: text,
    accountCode: matchesType ? rule.code : null,
    channel: matchesType ? rule.channel ?? null : null,
  };
}
