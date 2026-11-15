// LINE webhook logic for the accounting department. Framework- and DB-free:
// callers inject `store` and `reply`. Nothing here deploys or touches the website.
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseMessage } from "./parse";

export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  let given: Buffer;
  try { given = Buffer.from(signature, "base64"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type NewTxn = {
  type: "income" | "expense"; amount: number; description: string;
  accountCode: number | null; channel: string | null;
  dedupeKey: string; recordedBy: string; occurredAt: string;
};

export interface AccountingStore {
  /** Inserts a PENDING transaction. Returns existing ref (duplicate=true) if dedupeKey exists. */
  insertPending(t: NewTxn): Promise<{ ref: string; duplicate: boolean }>;
  /** Approves/rejects via accounting.approve_transaction_service on behalf of the owner. */
  decide(ref: string, decision: "approved" | "rejected"): Promise<{ ok: boolean; message: string }>;
  summary(query: "expenses_today" | "profit_month" | "anomalies" | "pending"): Promise<string>;
}

export type LineEvent = {
  type: string; replyToken?: string;
  source?: { userId?: string };
  timestamp?: number;
  message?: { id: string; type: string; text?: string };
};

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export async function handleLineEvents(
  events: LineEvent[],
  deps: { ownerLineUserId: string; store: AccountingStore; reply: (token: string, text: string) => Promise<void> },
): Promise<void> {
  for (const ev of events) {
    if (ev.type !== "message" || !ev.replyToken) continue;
    // Only the owner's LINE account may drive the books. Everyone else is ignored silently.
    if (ev.source?.userId !== deps.ownerLineUserId) continue;

    if (ev.message?.type !== "text" || !ev.message.text) {
      await deps.reply(ev.replyToken, "รับไฟล์/รูปแล้ว แต่ระบบยังไม่ผูกหลักฐานอัตโนมัติ กรุณาพิมพ์รายการเป็นข้อความ เช่น \"จ่ายค่า Canva Pro 399 บาท\"");
      continue;
    }

    const parsed = parseMessage(ev.message.text);
    let text: string;
    switch (parsed.kind) {
      case "entry": {
        const r = await deps.store.insertPending({
          type: parsed.type, amount: parsed.amount, description: parsed.description,
          accountCode: parsed.accountCode, channel: parsed.channel,
          dedupeKey: `line:${ev.message.id}`, recordedBy: "line",
          occurredAt: new Date(ev.timestamp ?? Date.now()).toISOString(),
        });
        if (r.duplicate) { text = `รายการนี้บันทึกไว้แล้ว (${r.ref}) ไม่บันทึกซ้ำ`; break; }
        text = [
          `รับรายการแล้ว สถานะ: รออนุมัติ (ยังไม่บันทึกจริง)`,
          `รหัส: ${r.ref}`,
          `ประเภท: ${parsed.type === "income" ? "รายรับ" : "รายจ่าย"} ${baht(parsed.amount)} บาท`,
          parsed.accountCode ? `หมวดบัญชี: ${parsed.accountCode}` : "หมวดบัญชี: ยังไม่ระบุ (ต้องจัดหมวดก่อนอนุมัติ)",
          `ตอบ \"ยืนยัน ${r.ref}\" หรือ \"ปฏิเสธ ${r.ref}\"`,
        ].join("\n");
        break;
      }
      case "decision": {
        const r = await deps.store.decide(parsed.ref, parsed.decision);
        text = r.ok ? r.message : `ทำรายการไม่สำเร็จ: ${r.message}`;
        break;
      }
      case "query":
        text = await deps.store.summary(parsed.query);
        break;
      default:
        text = `ยังไม่บันทึกอะไร: ${parsed.reason}`;
    }
    await deps.reply(ev.replyToken, text);
  }
}
