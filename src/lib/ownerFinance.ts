export interface FinanceTotals {
  member_income_satang: number;
  manual_income_satang: number;
  refund_satang: number;
  expense_satang: number;
  net_revenue_satang: number;
}
export interface FinanceMonth extends FinanceTotals {
  month: string;
  profit_satang: number;
}
export interface OwnerFinanceReport {
  timezone: "Asia/Bangkok";
  as_of: string;
  today: FinanceTotals & { goal_satang: number | null; remaining_satang: number | null; new_members: number };
  month: FinanceMonth & {
    goal_satang: number | null;
    pro_target_count: number | null;
    pro_active_count: number;
    previous_net_revenue_satang: number;
    daily_target_satang: number | null;
    days_elapsed: number;
    days_total: number;
  };
  months: FinanceMonth[];
  best_day: { date: string; net_revenue_satang: number } | null;
  streak_days: number;
  unmatched_approved_requests: number;
}
export interface OwnerVisitSummary {
  today: number;
  last_7_days: number;
  last_30_days: number;
  days: Array<{ date: string; visitors: number }>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const nonnegative = (value: unknown): value is number => integer(value) && value >= 0;
const day = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const amountOrNull = (value: unknown): value is number | null => value === null || nonnegative(value);
const totals = (value: unknown): value is FinanceTotals => record(value)
  && nonnegative(value.member_income_satang)
  && nonnegative(value.manual_income_satang)
  && nonnegative(value.refund_satang)
  && nonnegative(value.expense_satang)
  && integer(value.net_revenue_satang);
const month = (value: unknown): value is FinanceMonth => totals(value)
  && "month" in value && day(value.month)
  && "profit_satang" in value && integer(value.profit_satang);

export function parseOwnerFinanceReport(value: unknown): OwnerFinanceReport | null {
  if (!record(value) || value.timezone !== "Asia/Bangkok" || !day(value.as_of)
    || !record(value.today) || !totals(value.today)
    || !amountOrNull(value.today.goal_satang)
    || !amountOrNull(value.today.remaining_satang)
    || !nonnegative(value.today.new_members)
    || !record(value.month) || !month(value.month)
    || !amountOrNull(value.month.goal_satang)
    || !amountOrNull(value.month.daily_target_satang)
    || !(value.month.pro_target_count === null || nonnegative(value.month.pro_target_count))
    || !nonnegative(value.month.pro_active_count)
    || !integer(value.month.previous_net_revenue_satang)
    || !nonnegative(value.month.days_elapsed) || !nonnegative(value.month.days_total)
    || !Array.isArray(value.months) || value.months.length !== 12 || !value.months.every(month)
    || !(value.best_day === null || (record(value.best_day) && day(value.best_day.date)
      && integer(value.best_day.net_revenue_satang)))
    || !nonnegative(value.streak_days) || !nonnegative(value.unmatched_approved_requests)) return null;
  return value as unknown as OwnerFinanceReport;
}

export function parseOwnerVisitSummary(value: unknown): OwnerVisitSummary | null {
  if (!record(value) || !nonnegative(value.today) || !nonnegative(value.last_7_days)
    || !nonnegative(value.last_30_days) || !Array.isArray(value.days)
    || !value.days.every((item) => record(item) && day(item.date) && nonnegative(item.visitors))) return null;
  return value as unknown as OwnerVisitSummary;
}

export const baht = (satang: number): string => `฿${(satang / 100).toLocaleString("th-TH", {
  minimumFractionDigits: satang % 100 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
})}`;

export function ownerMotivation(report: OwnerFinanceReport, dueCount: number): string[] {
  const lines: string[] = [];
  const { today, month } = report;
  if (today.goal_satang !== null) {
    lines.push(today.remaining_satang && today.remaining_satang > 0
      ? `วันนี้ยังขาดอีก ${baht(today.remaining_satang)} ถึงเป้า`
      : `ถึงเป้าวันนี้แล้ว · รายรับสุทธิ ${baht(today.net_revenue_satang)}`);
  }
  if (month.goal_satang !== null) {
    const remaining = Math.max(0, month.goal_satang - month.net_revenue_satang);
    const daysLeft = Math.max(1, month.days_total - month.days_elapsed);
    lines.push(remaining > 0
      ? `เดือนนี้ยังขาด ${baht(remaining)} · ต้องเฉลี่ย ${baht(Math.ceil(remaining / daysLeft))} ต่อวันที่เหลือ`
      : `ถึงเป้ารายเดือนแล้ว · รายรับสุทธิ ${baht(month.net_revenue_satang)}`);
  }
  if (month.expense_satang > month.net_revenue_satang) {
    lines.push(`เดือนนี้รายจ่ายมากกว่ารายรับ ${baht(month.expense_satang - month.net_revenue_satang)}`);
  }
  if (dueCount > 0) lines.push(`มีรายจ่ายประจำถึงกำหนด ${dueCount} รายการ`);
  return lines;
}

export function thaiToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;
