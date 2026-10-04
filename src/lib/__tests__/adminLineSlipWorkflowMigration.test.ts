import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL(
  "../../../supabase/migrations/20261004100000_050_admin_line_slip_workflow.sql",
  import.meta.url,
), "utf8");

const section = (start: string, end: string) => {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
};

describe("admin LINE-slip workflow migration", () => {
  it("removes the member write while preserving the historical 048 function", () => {
    expect(sql).toContain("revoke execute on function public.report_membership_payment(uuid)");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toContain("drop function public.report_membership_payment");
    expect(sql).not.toContain("create or replace function public.report_membership_payment");
  });

  it("records LINE receipt through an admin-only idempotent RPC without granting access", () => {
    const record = section(
      "create function public.record_membership_line_slip_received(p_request_id uuid)",
      "revoke execute on function public.record_membership_line_slip_received(uuid)",
    );
    expect(record).toContain("if not public.is_admin() then");
    expect(record).toContain("where request.id = p_request_id");
    expect(record).toContain("for update");
    expect(record).toContain("if v_request.line_slip_received_at is null then");
    expect(record).toContain("v_request.status <> 'pending'");
    expect(record).toContain("line_slip_received_at = v_received_at");
    expect(record).toContain("line_slip_received_by = v_actor_id");
    expect(record).toContain("payment_reported_at = coalesce(request.payment_reported_at, v_received_at)");
    expect(record).toContain("payment_reported_at := v_request.payment_reported_at");
    expect(record).toContain("line_slip_received_at := v_request.line_slip_received_at");
    expect(record).not.toContain("activate_membership_internal");
    expect(record).not.toContain("membership_payment_confirmations");
    expect(record).not.toContain("founder_seat_ledger");
    expect(record).not.toContain("get_founder_capacity");
    expect(sql).toContain("grant execute on function public.record_membership_line_slip_received(uuid)\n  to authenticated");
    expect(sql).toContain("has_function_privilege('anon', 'public.record_membership_line_slip_received(uuid)', 'execute')");
  });

  it("keeps legacy self-attestation distinct and guards confirmation with admin provenance", () => {
    expect(sql).toContain("add column line_slip_received_at timestamptz");
    expect(sql).toContain("add column line_slip_received_by uuid references public.profiles(id)");
    expect(sql).toContain("Legacy member self-attested payment-report timestamp");
    expect(sql).toContain("create trigger trg_enforce_admin_line_slip_workflow");
    expect(sql).toContain("new.line_slip_received_at is null");
    expect(sql).toContain("Admin-recorded LINE slip is required before payment confirmation");
    expect(sql).toContain("new.line_slip_received_at := null");
    expect(sql).toContain("new.line_slip_received_by := null");
  });

  it("uses the existing Founder lock order but leaves the atomic 100-seat authority in confirmation", () => {
    const record = section(
      "create function public.record_membership_line_slip_received(p_request_id uuid)",
      "revoke execute on function public.record_membership_line_slip_received(uuid)",
    );
    expect(record).toContain("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    expect(sql).toContain("confirm_membership_payment remains the sole");
    expect(sql).toContain("permanent 1..100 Founder allocation");
  });

  it("fails closed unless migration 049 remains installed and publishes a separate marker", () => {
    expect(sql).toContain("public.has_my_founder_history()");
    expect(sql).toContain("public.prevent_repeat_founder_application()");
    expect(sql).toContain("trg_prevent_repeat_founder_application");
    expect(sql).toContain("system.membership_line_slip_workflow_v1_ready");
    expect(sql).not.toContain("system.membership_payment_confirmation_v1_ready");
  });

  it("is forward-only schema/privilege work and does not embed or rewrite production data", () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.(?:profiles|subscriptions|founder_seat_ledger|membership_payment_confirmations)\b/i);
    expect(sql).not.toMatch(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i);
    expect(sql).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
