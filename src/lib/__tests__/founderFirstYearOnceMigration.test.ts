import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL(
  "../../../supabase/migrations/20261003120000_049_founder_first_year_once.sql",
  import.meta.url,
), "utf8");

describe("Founder first-year-once migration", () => {
  it("uses the permanent Founder ledger and blocks pending repeat applications", () => {
    expect(sql).toContain("create or replace function public.has_my_founder_history()");
    expect(sql).toContain("from public.founder_seat_ledger ledger");
    expect(sql).toContain("where ledger.user_id = (select auth.uid())");
    expect(sql).toContain("create trigger trg_prevent_repeat_founder_application");
    expect(sql).toContain("new.plan_id = 'founder'");
    expect(sql).toContain("new.status = 'pending'");
    expect(sql).toContain("where ledger.user_id = new.user_id");
    expect(sql).toContain("Founder first-year offer cannot be claimed twice");
  });

  it("takes the existing Founder allocation lock before checking history", () => {
    const trigger = sql.slice(
      sql.indexOf("create or replace function public.prevent_repeat_founder_application()"),
      sql.indexOf("revoke execute on function public.prevent_repeat_founder_application()"),
    );
    const lock = trigger.indexOf("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    const ledgerRead = trigger.indexOf("from public.founder_seat_ledger ledger");
    expect(lock).toBeGreaterThan(-1);
    expect(ledgerRead).toBeGreaterThan(lock);
  });

  it("exposes only the caller's boolean history and does not rewrite production data", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke execute on function public.has_my_founder_history() from public, anon");
    expect(sql).toContain("grant execute on function public.has_my_founder_history() to authenticated");
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\./i);
  });
});
