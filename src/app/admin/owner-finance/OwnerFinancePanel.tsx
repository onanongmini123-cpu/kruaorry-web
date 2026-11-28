"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageWebp";
import { friendlyErrorMessage, GENERIC_LOAD_ERROR } from "@/lib/userMessages";
import {
  baht, monthStart, ownerMotivation, parseOwnerFinanceReport, parseOwnerVisitSummary,
  thaiToday, type OwnerFinanceReport, type OwnerVisitSummary,
} from "@/lib/ownerFinance";
import styles from "./OwnerFinancePanel.module.css";

type Tab = "today" | "month" | "money" | "goals";
type Entry = { id: string; kind: "income" | "expense" | "refund"; amount_satang: number;
  occurred_on: string; category: string; channel: string | null; description: string | null;
  receipt_path: string | null; voided_at: string | null };
type Goal = { month_start: string; income_target_satang: number; pro_target_count: number | null };
type Due = { id: string; category: string; amount_satang: number; due_on: string; status: string; paid: boolean };
type FinanceAudit = { id: string; action: string; entity_type: string; created_at: string };
type GoalAudit = { id: string; month_start: string; action: string; created_at: string };

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "today", label: "วันนี้" }, { key: "month", label: "เดือนนี้" },
  { key: "money", label: "รายการเงิน" }, { key: "goals", label: "เป้าหมาย" },
];
const CATEGORY_SUGGESTIONS = ["Vercel", "Supabase", "โดเมน", "AI", "โฆษณา", "อบรม", "อื่น ๆ"];
const CHANNEL_SUGGESTIONS = ["LINE", "Shopee", "โอนตรง", "อบรม"];
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const receiptBucket = "owner-expense-receipts";

function satangFromInput(input: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, decimal = ""] = input.trim().split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
const thaiDate = (date: string) => new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", {
  year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok",
});

export function OwnerFinancePanel() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("today");
  const [report, setReport] = useState<OwnerFinanceReport | null>(null);
  const [visits, setVisits] = useState<OwnerVisitSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [due, setDue] = useState<Due[]>([]);
  const [financeAudit, setFinanceAudit] = useState<FinanceAudit[]>([]);
  const [goalAudit, setGoalAudit] = useState<GoalAudit[]>([]);
  const [receiptLink, setReceiptLink] = useState<{ id: string; url: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visitorError, setVisitorError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entryKind, setEntryKind] = useState<Entry["kind"]>("income");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDate, setEntryDate] = useState(thaiToday);
  const [entryCategory, setEntryCategory] = useState("");
  const [entryChannel, setEntryChannel] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryReference, setEntryReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [voidingEntryId, setVoidingEntryId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [goalMonth, setGoalMonth] = useState(() => monthStart(thaiToday()));
  const [goalAmount, setGoalAmount] = useState("");
  const [goalPro, setGoalPro] = useState("");
  const [recurringCategory, setRecurringCategory] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringDay, setRecurringDay] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
    const [finance, visitor, entryRows, goalRows, dueRows, financeAuditRows, goalAuditRows] = await Promise.all([
      supabase.rpc("owner_finance_report"),
      supabase.rpc("owner_site_visit_summary", { p_days: 30 }),
      supabase.from("owner_manual_finance_entries")
        .select("id,kind,amount_satang,occurred_on,category,channel,description,receipt_path,voided_at")
        .order("occurred_on", { ascending: false }).limit(50),
      supabase.from("owner_monthly_goals")
        .select("month_start,income_target_satang,pro_target_count").order("month_start", { ascending: false }).limit(24),
      supabase.rpc("owner_recurring_expenses_due"),
      supabase.from("owner_finance_audit").select("id,action,entity_type,created_at")
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("owner_monthly_goal_audit").select("id,month_start,action,created_at")
        .order("created_at", { ascending: false }).limit(20),
    ]);
    const parsed = parseOwnerFinanceReport(finance.data);
    if (finance.error || !parsed) {
      setReport(null);
      setLoadError(friendlyErrorMessage(finance.error, GENERIC_LOAD_ERROR));
    }
    else setReport(parsed);
    const parsedVisits = parseOwnerVisitSummary(visitor.data);
    if (visitor.error || !parsedVisits) {
      setVisits(null);
      setVisitorError(friendlyErrorMessage(visitor.error, GENERIC_LOAD_ERROR));
    }
    else { setVisits(parsedVisits); setVisitorError(null); }
    if (!entryRows.error) setEntries((entryRows.data ?? []) as Entry[]);
    else setLoadError(friendlyErrorMessage(entryRows.error, GENERIC_LOAD_ERROR));
    if (!goalRows.error) setGoals((goalRows.data ?? []) as Goal[]);
    else setLoadError(friendlyErrorMessage(goalRows.error, GENERIC_LOAD_ERROR));
    if (!dueRows.error && dueRows.data && typeof dueRows.data === "object" && "items" in dueRows.data) {
      const items = (dueRows.data as { items?: unknown }).items;
      if (Array.isArray(items)) setDue(items as Due[]);
    }
    else if (dueRows.error) setLoadError(friendlyErrorMessage(dueRows.error, GENERIC_LOAD_ERROR));
    if (!financeAuditRows.error) setFinanceAudit((financeAuditRows.data ?? []) as FinanceAudit[]);
    else setLoadError(friendlyErrorMessage(financeAuditRows.error, GENERIC_LOAD_ERROR));
    if (!goalAuditRows.error) setGoalAudit((goalAuditRows.data ?? []) as GoalAudit[]);
    else setLoadError(friendlyErrorMessage(goalAuditRows.error, GENERIC_LOAD_ERROR));
    } catch (error) {
      setReport(null);
      setLoadError(friendlyErrorMessage(error, GENERIC_LOAD_ERROR));
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const currentMonth = report?.month.month ?? monthStart(thaiToday());
  const currentGoal = goals.find((goal) => goal.month_start === goalMonth);
  const previousMonth = new Date(`${goalMonth}T12:00:00+07:00`);
  previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  const previousGoal = goals.find((goal) => goal.month_start === monthStart(previousMonth.toISOString().slice(0, 10)));
  const dueCount = due.filter((item) => !item.paid && ["overdue", "due_today"].includes(item.status)).length;

  async function runAction(action: () => Promise<void>, success: string): Promise<boolean> {
    setBusy(true); setActionError(null); setNotice(null);
    try { await action(); setNotice(success); await load(); return true; }
    catch (error) { setActionError(friendlyErrorMessage(error)); return false; }
    finally { setBusy(false); }
  }

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = satangFromInput(entryAmount);
    if (!amount || !entryCategory.trim()) { setActionError("กรุณากรอกยอดเงินและหมวดหมู่ให้ครบ"); return; }
    if (entryDate > thaiToday()) { setActionError("วันที่รายการต้องไม่เกินวันนี้"); return; }
    await runAction(async () => {
      const id = crypto.randomUUID();
      let path: string | null = null;
      if (receipt) {
        if (!RECEIPT_TYPES.includes(receipt.type) || (receipt.type === "application/pdf" && receipt.size > 5 * 1024 * 1024)) {
          throw new Error("สลิปต้องเป็น JPEG, PNG, WebP หรือ PDF และไม่เกิน 5 MB");
        }
        const image = receipt.type === "application/pdf" ? null : await compressImageForUpload(receipt, 1600);
        const blob = image?.blob ?? receipt;
        if (blob.size > 5 * 1024 * 1024) throw new Error("สลิปหลังย่อยังเกิน 5 MB กรุณาเลือกไฟล์อื่น");
        const extension = image?.extension ?? "pdf";
        path = `entries/${id}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from(receiptBucket).upload(path, blob, {
          upsert: false, contentType: image?.contentType ?? "application/pdf",
        });
        if (upload.error) throw upload.error;
      }
      const result = await supabase.rpc("owner_add_finance_entry", {
        p_entry_id: id, p_kind: entryKind, p_amount_satang: amount, p_occurred_on: entryDate,
        p_category: entryCategory.trim(), p_channel: entryChannel.trim() || null,
        p_description: entryDescription.trim() || null, p_source_reference: entryReference.trim() || null,
        p_receipt_path: path,
      });
      if (result.error) {
        if (path) await supabase.storage.from(receiptBucket).remove([path]);
        throw result.error;
      }
      setEntryAmount(""); setEntryCategory(""); setEntryChannel("");
      setEntryDescription(""); setEntryReference(""); setReceipt(null);
    }, "บันทึกรายการแล้ว");
  }

  async function voidEntry(event: React.FormEvent<HTMLFormElement>, entry: Entry) {
    event.preventDefault();
    const reason = voidReason.trim();
    if (!reason) { setActionError("กรุณาระบุเหตุผลก่อนยกเลิก"); return; }
    const saved = await runAction(async () => {
      const result = await supabase.rpc("owner_void_finance_entry", { p_entry_id: entry.id, p_reason: reason });
      if (result.error) throw result.error;
    }, "ยกเลิกรายการแล้ว ประวัติยังอยู่");
    if (saved) { setVoidingEntryId(null); setVoidReason(""); }
  }

  async function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = satangFromInput(goalAmount);
    const pro = goalPro.trim() === "" ? null : Number(goalPro);
    if (!amount || (pro !== null && (!Number.isSafeInteger(pro) || pro < 0))) {
      setActionError("กรุณากรอกเป้าเป็นจำนวนเงินที่มากกว่า 0 และจำนวนสมาชิกที่ถูกต้อง"); return;
    }
    await runAction(async () => {
      const result = await supabase.rpc("owner_save_monthly_goal", {
        p_month_start: goalMonth, p_income_target_satang: amount, p_pro_target_count: pro,
      });
      if (result.error) throw result.error;
    }, "บันทึกเป้าหมายแล้ว");
  }

  async function saveRecurring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = satangFromInput(recurringAmount);
    const day = Number(recurringDay);
    if (!amount || !recurringCategory.trim() || !Number.isInteger(day) || day < 1 || day > 31) {
      setActionError("กรุณากรอกหมวด ยอด และวันครบกำหนดให้ถูกต้อง"); return;
    }
    await runAction(async () => {
      const result = await supabase.rpc("owner_save_recurring_expense", {
        p_id: crypto.randomUUID(), p_create: true, p_category: recurringCategory.trim(),
        p_amount_satang: amount, p_day_of_month: day, p_starts_on: currentMonth,
      });
      if (result.error) throw result.error;
      setRecurringCategory(""); setRecurringAmount("");
    }, "เพิ่มคำเตือนรายจ่ายประจำแล้ว ยังไม่นับเป็นรายจ่ายจริง");
  }

  async function markPaid(item: Due) {
    await runAction(async () => {
      const result = await supabase.rpc("owner_mark_recurring_expense_paid", {
        p_recurring_id: item.id, p_due_month: currentMonth, p_entry_id: crypto.randomUUID(),
      });
      if (result.error) throw result.error;
    }, "บันทึกว่าจ่ายแล้ว");
  }

  async function exportCsv() {
    await runAction(async () => {
      const result = await supabase.rpc("owner_finance_csv");
      if (result.error || typeof result.data !== "string") throw result.error ?? new Error("ส่งออกไม่สำเร็จ");
      const blob = new Blob(["\uFEFF", result.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `kruaorry-finance-${currentMonth.slice(0, 7)}.csv`;
      link.click(); URL.revokeObjectURL(url);
    }, "ดาวน์โหลดรายงาน CSV แล้ว");
  }

  async function showReceipt(entry: Entry) {
    if (!entry.receipt_path) return;
    setActionError(null);
    const result = await supabase.storage.from(receiptBucket).createSignedUrl(entry.receipt_path, 60);
    if (result.error || !result.data?.signedUrl) {
      setActionError(friendlyErrorMessage(result.error)); return;
    }
    setReceiptLink({ id: entry.id, url: result.data.signedUrl });
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div><Link href="/admin" className={styles.back}>← กลับหลังบ้าน</Link>
        <h1>บัญชีและเป้าหมาย</h1>
        <p>เฉพาะเจ้าของระบบ · ยอดเงินเป็นกำไรเบื้องต้นจากรายการที่บันทึก</p>
      </div>
      <button className={styles.button} type="button" onClick={() => void load()} disabled={loading || busy}>รีเฟรชข้อมูล</button>
    </header>
    {loadError && <p role="alert" className={styles.warning}>{loadError} ข้อมูลบัญชีจะพร้อมหลังติดตั้งส่วนสรุป 067</p>}
    {loading && <p role="status">กำลังโหลดข้อมูลบัญชี…</p>}
    {actionError && <p role="alert" className={styles.warning}>{actionError}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div role="tablist" aria-label="ส่วนบัญชีและเป้าหมาย" className={styles.tabs}>
      {TABS.map(({ key, label }, index) => <button key={key} type="button" role="tab"
        id={`owner-finance-tab-${key}`} aria-controls={`owner-finance-panel-${key}`}
        aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
          setTab(next.key);
          document.getElementById(`owner-finance-tab-${next.key}`)?.focus();
        }}>{label}</button>)}
    </div>
    {tab === "today" && <section role="tabpanel" id="owner-finance-panel-today" aria-labelledby="owner-finance-tab-today" className={styles.panel}>
      <h2>วันนี้</h2>
      {report && <>
        <div className={styles.cards}>
          <Metric label="รายรับสุทธิวันนี้" value={baht(report.today.net_revenue_satang)} />
          <Metric label="เป้าวันนี้" value={report.today.goal_satang === null ? "ยังไม่ได้ตั้งเป้า" : baht(report.today.goal_satang)} />
          <Metric label="ผู้เข้าชมโดยประมาณ" value={visits ? `${visits.today} คน` : "ยังโหลดไม่ได้"} />
          <Metric label="สมาชิกใหม่วันนี้" value={`${report.today.new_members} คน`} />
        </div>
        {visitorError && <p className={styles.muted}>{visitorError}</p>}
        <ul className={styles.motivation}>{ownerMotivation(report, dueCount).map((line) => <li key={line}>{line}</li>)}</ul>
        {report.unmatched_approved_requests > 0 && <p className={styles.warning}>มีคำขออนุมัติที่ไม่พบหลักฐานยืนยันชำระ {report.unmatched_approved_requests} รายการ · ต้องตรวจ ไม่รวมเป็นรายรับ</p>}
        <div className={styles.cards}>
          <Metric label="รายรับสุทธิรายวันสูงสุด" value={report.best_day ? `${baht(report.best_day.net_revenue_satang)} · ${thaiDate(report.best_day.date)}` : "ยังไม่มีรายการ"} />
          <Metric label="ถึงเป้าต่อเนื่อง (วันจบแล้ว)" value={`${report.streak_days} วัน`} />
        </div>
      </>}
      <h3>ผู้เข้าชม 30 วัน</h3>
      {visits ? <>
        <p className={styles.muted}>7 วัน {visits.last_7_days} ครั้ง · 30 วัน {visits.last_30_days} ครั้ง · ล้างคุกกี้หรือใช้อุปกรณ์หลายเครื่องอาจนับซ้ำ</p>
        <div className={styles.chart} aria-label="จำนวนผู้เข้าชมแต่ละวัน 30 วัน">
          {visits.days.map((item) => <div key={item.date} className={styles.chartRow}>
            <span>{item.date.slice(5)}</span><div className={styles.barTrack}><div className={styles.bar} style={{ width: `${Math.max(0, item.visitors / Math.max(1, ...visits.days.map((d) => d.visitors)) * 100)}%` }} /></div><strong>{item.visitors}</strong>
          </div>)}
        </div>
      </> : <p className={styles.muted}>ยังไม่มีข้อมูลผู้เข้าชมที่แสดงได้</p>}
    </section>}
    {tab === "month" && <section role="tabpanel" id="owner-finance-panel-month" aria-labelledby="owner-finance-tab-month" className={styles.panel}>
      <h2>เดือนนี้</h2>
      {report ? <>
        <div className={styles.cards}>
          <Metric label="รายรับสุทธิ" value={baht(report.month.net_revenue_satang)} />
          <Metric label="รายจ่ายจริง" value={baht(report.month.expense_satang)} />
          <Metric label="กำไรเบื้องต้น" value={baht(report.month.profit_satang)} />
          <Metric label="เป้ารายเดือน" value={report.month.goal_satang === null ? "ยังไม่ได้ตั้งเป้า" : baht(report.month.goal_satang)} />
          <Metric label="เทียบเดือนก่อน" value={baht(report.month.net_revenue_satang - report.month.previous_net_revenue_satang)} />
          <Metric label="สมาชิก Pro ที่ใช้งานอยู่ / เป้า" value={`${report.month.pro_active_count} / ${report.month.pro_target_count ?? "ยังไม่ตั้ง"}`} />
        </div>
        <p className={styles.muted}>รายรับสมาชิกนับจากรายการที่แอดมินยืนยันแล้วเท่านั้น · เงินคืนหักแยก · กำไรยังไม่รวมภาษีและค่าใช้จ่ายที่ไม่ได้กรอก</p>
        <div className={styles.row}><h3>รายงาน 12 เดือน</h3><button type="button" className={styles.button} onClick={() => void exportCsv()} disabled={busy}>ดาวน์โหลด CSV</button></div>
        <div className={styles.chart} aria-label="รายรับสุทธิ รายจ่าย และกำไรเบื้องต้นย้อนหลัง 12 เดือน">
          {report.months.map((item) => <div key={item.month} className={styles.chartRow}>
            <span>{item.month.slice(0, 7)}</span>
            <div className={styles.chartSeries}>
              <span>รับ <i className={styles.barTrack}><i className={styles.bar} style={{ width: `${Math.max(0, item.net_revenue_satang) / Math.max(1, ...report.months.map((m) => Math.max(0, m.net_revenue_satang))) * 100}%` }} /></i></span>
              <span>จ่าย <i className={styles.barTrack}><i className={styles.barExpense} style={{ width: `${item.expense_satang / Math.max(1, ...report.months.map((m) => m.expense_satang)) * 100}%` }} /></i></span>
              <span>กำไร <i className={styles.barTrack}><i className={styles.barProfit} style={{ width: `${Math.max(0, item.profit_satang) / Math.max(1, ...report.months.map((m) => Math.max(0, m.profit_satang))) * 100}%` }} /></i></span>
            </div>
            <strong>{baht(item.profit_satang)}</strong>
          </div>)}
        </div>
        <div className={styles.tableWrap}><table><caption>ตัวเลขรายเดือนย้อนหลัง 12 เดือน</caption><thead><tr><th>เดือน</th><th>รายรับสมาชิก</th><th>รายรับอื่น</th><th>เงินคืน</th><th>รายจ่าย</th><th>กำไรเบื้องต้น</th></tr></thead><tbody>
          {report.months.map((item) => <tr key={item.month}><th>{item.month.slice(0, 7)}</th><td>{baht(item.member_income_satang)}</td><td>{baht(item.manual_income_satang)}</td><td>{baht(item.refund_satang)}</td><td>{baht(item.expense_satang)}</td><td>{baht(item.profit_satang)}</td></tr>)}
        </tbody></table></div>
      </> : !loading && <p>ข้อมูลรายเดือนยังไม่พร้อม</p>}
    </section>}
    {tab === "money" && <section role="tabpanel" id="owner-finance-panel-money" aria-labelledby="owner-finance-tab-money" className={styles.panel}>
      <h2>รายการเงิน</h2>
      <p className={styles.muted}>การชำระค่าสมาชิกที่ยืนยันแล้วถูกนับอัตโนมัติ อย่าบันทึกซ้ำ · ยกเลิกรายการผิดได้พร้อมเหตุผล</p>
      <form onSubmit={(event) => void addEntry(event)} className={styles.form}>
        <label>ประเภท<select value={entryKind} onChange={(event) => setEntryKind(event.target.value as Entry["kind"])}><option value="income">รายรับอื่น</option><option value="expense">รายจ่าย</option><option value="refund">เงินคืน</option></select></label>
        <label>ยอดเงิน (บาท)<input required inputMode="decimal" value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} placeholder="เช่น 599.00" /></label>
        <label>วันที่รายการ<input required type="date" max={thaiToday()} value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
        <label>หมวดหมู่<input required list="finance-categories" maxLength={60} value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)} /><datalist id="finance-categories">{CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label>ช่องทาง<input list="finance-channels" maxLength={60} value={entryChannel} onChange={(event) => setEntryChannel(event.target.value)} /><datalist id="finance-channels">{CHANNEL_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label>เลขอ้างอิง (ถ้ามี)<input maxLength={120} value={entryReference} onChange={(event) => setEntryReference(event.target.value)} /></label>
        <label className={styles.wide}>หมายเหตุ<input maxLength={500} value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} /></label>
        <label className={styles.wide}>แนบสลิป (ไม่บังคับ · ≤5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></label>
        <button className={styles.buttonPrimary} type="submit" disabled={busy}>บันทึกรายการ</button>
      </form>
      <h3>รายการล่าสุด</h3>
      {entries.length === 0 ? <p className={styles.muted}>ยังไม่มีรายการเงินที่บันทึกเอง</p> : <div className={styles.entryList}>
        {entries.map((entry) => <article key={entry.id} className={styles.entry}>
          <div><strong>{entry.kind === "income" ? "รายรับอื่น" : entry.kind === "expense" ? "รายจ่าย" : "เงินคืน"} · {baht(entry.amount_satang)}</strong>
            <p>{thaiDate(entry.occurred_on)} · {entry.category}{entry.channel ? ` · ${entry.channel}` : ""}{entry.voided_at ? " · ยกเลิกแล้ว" : ""}</p>
            {entry.description && <p>{entry.description}</p>}
            {entry.receipt_path && <div className={styles.receiptActions}>
              <button type="button" className={styles.button} onClick={() => void showReceipt(entry)}>ขอลิงก์ดูสลิป</button>
              {receiptLink?.id === entry.id && <a href={receiptLink.url} target="_blank" rel="noopener noreferrer">เปิดสลิป (ลิงก์ใช้ได้ 60 วินาที)</a>}
            </div>}
          </div>
          {!entry.voided_at && (voidingEntryId === entry.id ? <form className={styles.voidForm} onSubmit={(event) => void voidEntry(event, entry)}>
            <label htmlFor={`void-reason-${entry.id}`}>เหตุผลที่ยกเลิกรายการ</label>
            <input id={`void-reason-${entry.id}`} required maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} autoFocus />
            <p>รายการจะไม่ถูกนับในยอดเงิน แต่ประวัติยังอยู่</p>
            <div className={styles.voidActions}>
              <button type="submit" className={styles.buttonPrimary} disabled={busy || !voidReason.trim()}>ยืนยันยกเลิก</button>
              <button type="button" className={styles.button} disabled={busy} onClick={() => { setVoidingEntryId(null); setVoidReason(""); }}>ไม่ยกเลิก</button>
            </div>
          </form> : <button type="button" className={styles.button} disabled={busy} onClick={() => { setActionError(null); setVoidReason(""); setVoidingEntryId(entry.id); }}>ยกเลิก</button>)}
        </article>)}
      </div>}
      <h3>รายจ่ายประจำ</h3><p className={styles.muted}>รายการนี้เป็นคำเตือน ยังไม่เป็นรายจ่ายจริงจนกด “จ่ายแล้ว”</p>
      <form onSubmit={(event) => void saveRecurring(event)} className={styles.form}>
        <label>หมวดหมู่<input required list="finance-categories" maxLength={60} value={recurringCategory} onChange={(event) => setRecurringCategory(event.target.value)} /></label>
        <label>ยอดที่คาด (บาท)<input required inputMode="decimal" value={recurringAmount} onChange={(event) => setRecurringAmount(event.target.value)} /></label>
        <label>ครบกำหนดวันที่<input required type="number" min="1" max="31" value={recurringDay} onChange={(event) => setRecurringDay(event.target.value)} /></label>
        <button className={styles.buttonPrimary} type="submit" disabled={busy}>เพิ่มคำเตือน</button>
      </form>
      {due.length === 0 ? <p className={styles.muted}>ยังไม่มีรายจ่ายประจำเดือนนี้</p> : <div className={styles.entryList}>{due.map((item) => <article key={item.id} className={styles.entry}>
        <div><strong>{item.category} · {baht(item.amount_satang)}</strong><p>ครบกำหนด {thaiDate(item.due_on)} · {item.paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}</p></div>
        {!item.paid && <button className={styles.button} type="button" disabled={busy} onClick={() => void markPaid(item)}>จ่ายแล้ว</button>}
      </article>)}</div>}
      <h3>ประวัติการเปลี่ยนรายการเงิน</h3>
      {financeAudit.length === 0 ? <p className={styles.muted}>ยังไม่มีประวัติ</p> : <ul className={styles.goalList}>
        {financeAudit.map((item) => <li key={item.id}>{new Date(item.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {item.entity_type === "entry" ? "รายการเงิน" : "รายจ่ายประจำ"} · {item.action}</li>)}
      </ul>}
    </section>}
    {tab === "goals" && <section role="tabpanel" id="owner-finance-panel-goals" aria-labelledby="owner-finance-tab-goals" className={styles.panel}>
      <h2>เป้าหมาย</h2><p className={styles.muted}>ตั้งเองทุกเดือน ไม่มีค่าเริ่มต้น เป้ารายวันปัดขึ้นตามจำนวนวันของเดือน</p>
      <form onSubmit={(event) => void saveGoal(event)} className={styles.form}>
        <label>เดือน<input required type="month" value={goalMonth.slice(0, 7)} onChange={(event) => setGoalMonth(`${event.target.value}-01`)} /></label>
        <label>เป้ารายรับสุทธิ (บาท)<input required inputMode="decimal" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} /></label>
        <label>เป้าสมาชิก Pro (ไม่บังคับ)<input type="number" min="0" value={goalPro} onChange={(event) => setGoalPro(event.target.value)} /></label>
        <div className={styles.row}><button className={styles.button} type="button" disabled={!previousGoal || busy} onClick={() => {
          if (!previousGoal) return;
          setGoalAmount(String(previousGoal.income_target_satang / 100));
          setGoalPro(previousGoal.pro_target_count === null ? "" : String(previousGoal.pro_target_count));
        }}>ใช้เป้าเดียวกับเดือนก่อน</button>
        <button className={styles.buttonPrimary} type="submit" disabled={busy}>บันทึกเป้า</button></div>
      </form>
      {currentGoal && <p className={styles.notice}>เดือนที่เลือกตั้งไว้ {baht(currentGoal.income_target_satang)} · เป้า Pro {currentGoal.pro_target_count ?? "ยังไม่ตั้ง"}</p>}
      <h3>เป้าที่ตั้งไว้</h3>{goals.length === 0 ? <p className={styles.muted}>ยังไม่ได้ตั้งเป้ารายเดือน</p> : <ul className={styles.goalList}>{goals.map((goal) => <li key={goal.month_start}>{goal.month_start.slice(0, 7)} · {baht(goal.income_target_satang)} · Pro {goal.pro_target_count ?? "—"}</li>)}</ul>}
      <h3>ประวัติการตั้งเป้า</h3>{goalAudit.length === 0 ? <p className={styles.muted}>ยังไม่มีประวัติ</p> : <ul className={styles.goalList}>
        {goalAudit.map((item) => <li key={item.id}>{item.month_start.slice(0, 7)} · {item.action === "create" ? "ตั้งเป้า" : "แก้เป้า"} · {new Date(item.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</li>)}
      </ul>}
    </section>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}
