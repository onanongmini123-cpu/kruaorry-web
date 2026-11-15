import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAmount, parseMessage } from "./parse";
import { handleLineEvents, verifyLineSignature, type AccountingStore, type NewTxn } from "./webhook";

describe("parseMessage", () => {
  it("classifies the spec's example messages", () => {
    expect(parseMessage("จ่ายค่า Canva Pro 399 บาท")).toMatchObject({ kind: "entry", type: "expense", amount: 399, accountCode: 6000 });
    expect(parseMessage("ค่าโฆษณา Facebook 800 บาท")).toMatchObject({ type: "expense", amount: 800, accountCode: 6100 });
    expect(parseMessage("รับเงินสมาชิก Teacher Pro 299 บาท")).toMatchObject({ type: "income", amount: 299, accountCode: 4000, channel: "kruaorry_com" });
    expect(parseMessage("ซื้ออุปกรณ์สำนักงาน 1,200 บาท")).toMatchObject({ type: "expense", amount: 1200, accountCode: 6200 });
  });
  it("recognises queries and decisions", () => {
    expect(parseMessage("สรุปรายจ่ายวันนี้")).toEqual({ kind: "query", query: "expenses_today" });
    expect(parseMessage("สรุปกำไรเดือนนี้")).toEqual({ kind: "query", query: "profit_month" });
    expect(parseMessage("ตรวจสอบรายการผิดปกติ")).toEqual({ kind: "query", query: "anomalies" });
    expect(parseMessage("ยืนยัน TXN-202611-000012")).toEqual({ kind: "decision", decision: "approved", ref: "TXN-202611-000012" });
    expect(parseMessage("ปฏิเสธ txn-202611-000012")).toMatchObject({ decision: "rejected" });
  });
  it("never guesses: missing or ambiguous amounts are unclear", () => {
    expect(parseMessage("จ่ายค่า Canva Pro").kind).toBe("unclear");
    expect(parseMessage("จ่ายค่าของ 100 และ 200").kind).toBe("unclear");
    expect(parseMessage("สวัสดี").kind).toBe("unclear");
  });
  it("leaves the account empty when category contradicts direction", () => {
    expect(parseMessage("จ่ายค่าสมาชิก 100 บาท")).toMatchObject({ type: "expense", accountCode: null });
  });
  it("parses amounts", () => {
    expect(parseAmount("1,200.50 บาท")).toBe(1200.5);
    expect(parseAmount("0 บาท")).toBeNull();
  });
});

describe("verifyLineSignature", () => {
  const body = '{"events":[]}';
  const sig = createHmac("sha256", "secret").update(body).digest("base64");
  it("accepts only the correct signature", () => {
    expect(verifyLineSignature(body, sig, "secret")).toBe(true);
    expect(verifyLineSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyLineSignature(body, sig, "other")).toBe(false);
    expect(verifyLineSignature(body, null, "secret")).toBe(false);
  });
});

function memoryStore() {
  const seen = new Map<string, string>(); const inserted: NewTxn[] = [];
  const store: AccountingStore = {
    async insertPending(t) {
      const ex = seen.get(t.dedupeKey); if (ex) return { ref: ex, duplicate: true };
      const ref = `TXN-202611-${String(seen.size + 1).padStart(6, "0")}`;
      seen.set(t.dedupeKey, ref); inserted.push(t); return { ref, duplicate: false };
    },
    async decide(ref, d) { return { ok: true, message: `${ref} ${d}` }; },
    async summary(q) { return `summary:${q}`; },
  };
  return { store, inserted };
}
const ev = (userId: string, text: string, id = "m1") => ({
  type: "message", replyToken: "t", source: { userId }, timestamp: 1_700_000_000_000,
  message: { id, type: "text", text },
});

describe("handleLineEvents", () => {
  it("records as pending only, replies with a ref, and dedupes redelivery", async () => {
    const { store, inserted } = memoryStore(); const out: string[] = [];
    const deps = { ownerLineUserId: "OWNER", store, reply: async (_: string, t: string) => { out.push(t); } };
    await handleLineEvents([ev("OWNER", "จ่ายค่า Canva Pro 399 บาท")], deps);
    await handleLineEvents([ev("OWNER", "จ่ายค่า Canva Pro 399 บาท")], deps); // LINE redelivery
    expect(inserted).toHaveLength(1);
    expect(out[0]).toContain("รออนุมัติ");
    expect(out[0]).toContain("TXN-202611-000001");
    expect(out[1]).toContain("ไม่บันทึกซ้ำ");
  });
  it("ignores everyone except the owner", async () => {
    const { store, inserted } = memoryStore(); const out: string[] = [];
    await handleLineEvents([ev("STRANGER", "จ่ายค่า Canva Pro 399 บาท")],
      { ownerLineUserId: "OWNER", store, reply: async (_, t) => { out.push(t); } });
    expect(inserted).toHaveLength(0); expect(out).toHaveLength(0);
  });
  it("records nothing for unclear text", async () => {
    const { store, inserted } = memoryStore(); const out: string[] = [];
    await handleLineEvents([ev("OWNER", "จ่ายค่า Canva Pro")],
      { ownerLineUserId: "OWNER", store, reply: async (_, t) => { out.push(t); } });
    expect(inserted).toHaveLength(0); expect(out[0]).toContain("ยังไม่บันทึกอะไร");
  });
});
