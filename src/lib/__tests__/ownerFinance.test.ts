import { describe, expect, it } from "vitest";
import { ownerMotivation, parseOwnerFinanceReport, parseOwnerVisitSummary } from "../ownerFinance";

const totals = { member_income_satang: 10000, manual_income_satang: 0, refund_satang: 0,
  expense_satang: 0, net_revenue_satang: 10000 };
const sample = {
  timezone: "Asia/Bangkok", as_of: "2026-11-27",
  today: { ...totals, goal_satang: 15000, remaining_satang: 5000, new_members: 1 },
  month: { ...totals, month: "2026-11-01", profit_satang: 10000, goal_satang: 30000,
    pro_target_count: 5, pro_active_count: 2, previous_net_revenue_satang: 9000,
    daily_target_satang: 1000, days_elapsed: 27, days_total: 30 },
  months: Array.from({ length: 12 }, (_, i) => ({ ...totals, month: `2026-${String(i + 1).padStart(2, "0")}-01`, profit_satang: 10000 })),
  best_day: { date: "2026-11-26", net_revenue_satang: 12000 },
  streak_days: 2, unmatched_approved_requests: 0,
};

describe("owner finance report boundary", () => {
  it("accepts an aggregate report and makes direct, numeric motivation", () => {
    const report = parseOwnerFinanceReport(sample);
    expect(report).not.toBeNull();
    expect(ownerMotivation(report!, 2)).toContain("วันนี้ยังขาดอีก ฿50 ถึงเป้า");
  });
  it("rejects malformed or identity-bearing report shapes", () => {
    expect(parseOwnerFinanceReport({ ...sample, months: [] })).toBeNull();
    expect(parseOwnerFinanceReport({ ...sample, today: { ...sample.today, new_members: "1" } })).toBeNull();
  });
  it("accepts only numeric visitor counts", () => {
    expect(parseOwnerVisitSummary({ today: 1, last_7_days: 2, last_30_days: 3, days: [{ date: "2026-11-27", visitors: 1 }] })).not.toBeNull();
    expect(parseOwnerVisitSummary({ today: "1", last_7_days: 2, last_30_days: 3, days: [] })).toBeNull();
  });
});
