import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261001180000_047_founder_payment_confirmation.sql"),
  "utf8",
);

const section = (start: string, end: string) => {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
};

describe("Founder payment-confirmation migration", () => {
  it("separates acquisition and renewal prices without rewriting old migrations", () => {
    expect(sql).toContain("add column renewal_price_amount_thb integer");
    expect(sql).toMatch(/when id in \('founder', 'teacher'\) then 599/);
    expect(sql).toContain("price_amount_thb = 299");
    expect(sql).toContain("renewal_price_amount_thb = 599");
    expect(sql).toContain("add constraint plans_teacher_offer_price");
    expect(sql).toMatch(/id <> 'teacher'\s+or price_amount_thb is not distinct from 599/);
  });

  it("adds the exact application and payment-confirmation contract", () => {
    for (const column of [
      "reference_code",
      "quoted_amount_thb",
      "payment_reported_at",
      "payment_paid_at",
      "payment_confirmed_at",
      "payment_confirmed_by",
      "payment_confirmed_amount_thb",
      "payment_reference",
    ]) {
      expect(sql).toContain(`add column ${column}`);
    }

    const createApplication = section(
      "create function public.create_membership_application(p_plan_id text)",
      "revoke execute on function public.create_membership_application(text)",
    );
    expect(createApplication).toContain("returns table (");
    expect(createApplication).toContain("reference_code text");
    expect(createApplication).toContain("quoted_amount_thb integer");
    expect(createApplication).toContain("payment_reported_at timestamptz");
    expect(createApplication).toContain("request.status = 'pending'");
    expect(createApplication).toContain("hashtextextended('membership-application:' || v_user_id::text, 0)");
    expect(createApplication).not.toContain("v_user_id::text || ':' || p_plan_id");
    expect(createApplication).not.toContain("request.plan_id = p_plan_id");
    expect(createApplication).toContain("v_request.plan_id <> p_plan_id");
    expect(createApplication).toContain("มีใบสมัครแพ็กเกจอื่นที่รอดำเนินการอยู่");
    expect(createApplication).toContain("v_plan.price_amount_thb");
    expect(sql).toContain("revoke insert on table public.upgrade_requests from anon, authenticated");
    expect(sql).toContain("create unique index upgrade_requests_one_pending_per_user");
    expect(sql).toMatch(/on public\.upgrade_requests\(user_id\)\s+where status = 'pending'/);
    expect(sql).toContain("v_duplicate_pending_users > 0");
    expect(sql).toContain("members have multiple pending membership applications");
  });

  it("separates member-reported payment from admin-confirmed payment", () => {
    const report = section(
      "create function public.report_membership_payment(p_request_id uuid)",
      "revoke execute on function public.report_membership_payment(uuid)",
    );
    expect(report).toContain("v_user_id uuid := (select auth.uid())");
    expect(report).toContain("request.user_id = v_user_id");
    expect(report).toContain("request.status = 'pending'");
    expect(report).toContain("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    expect(report).toContain("Founder 100 is full; convert this application to Teacher");
    expect(report).toContain("if v_request.payment_reported_at is null then");
    expect(report.indexOf("if v_request.payment_reported_at is null then")).toBeLessThan(
      report.indexOf("Founder 100 is full; convert this application to Teacher"),
    );
    expect(report).toContain("set payment_reported_at = now()");
    expect(report).not.toContain("activate_membership_internal");
    expect(report).not.toContain("founder_seat_ledger");
    expect(sql).toContain("grant execute on function public.report_membership_payment(uuid) to authenticated");
    expect(sql).toContain("revoke execute on function public.report_membership_payment(uuid) from public, anon");
  });

  it("requires an explicit, reference-preserving conversion to canonical Teacher", () => {
    const convert = section(
      "create function public.convert_founder_application_to_teacher(p_request_id uuid)",
      "revoke execute on function public.convert_founder_application_to_teacher(uuid)",
    );
    expect(convert).toContain("request.user_id = v_user_id");
    expect(convert).toContain("request.status = 'pending'");
    expect(convert).toContain("plan.id = 'teacher'");
    expect(convert).toContain("plan.price_amount_thb = 599");
    expect(convert).toContain("v_request.plan_id <> 'founder'");
    expect(convert).toContain("plan_id = 'teacher'");
    expect(convert).toContain("quoted_amount_thb = v_teacher.price_amount_thb");
    expect(convert).toContain("payment_reported_at = null");
    expect(convert).toContain("hashtextextended('membership-application:' || v_user_id::text, 0)");
    expect(convert).not.toContain("v_user_id::text || ':teacher'");
    expect(convert).not.toContain("reference_code =");
    expect(convert).not.toContain("activate_membership_internal");
    expect(sql).toContain("grant execute on function public.convert_founder_application_to_teacher(uuid) to authenticated");
    expect(sql).toContain("revoke execute on function public.convert_founder_application_to_teacher(uuid) from public, anon");
  });

  it("makes confirmation admin-only, atomic, and safely idempotent", () => {
    const confirm = section(
      "create function public.confirm_membership_payment(",
      "revoke execute on function public.confirm_membership_payment",
    );
    expect(confirm).toContain("if not public.is_admin() then");
    expect(confirm).toContain("membership-payment:");
    expect(confirm).toContain("where confirmation.idempotency_key = p_idempotency_key");
    expect(confirm).toContain("return v_existing.subscription_id");
    expect(confirm).toContain("v_request.status <> 'pending'");
    expect(confirm).toContain("Founder 100 is full; convert this application to Teacher");
    expect(confirm).toContain("v_request.payment_reported_at is null");
    expect(confirm).toContain("p_amount_thb <> v_request.quoted_amount_thb");
    expect(confirm).toContain("payment_confirmed_amount_thb = p_amount_thb");
    expect(confirm).toContain("public.activate_membership_internal");
    expect(confirm).toContain("insert into public.membership_payment_confirmations");
    expect(confirm).toContain("set status = 'approved'");
  });

  it("uses a permanent, structurally bounded Founder ledger", () => {
    expect(sql).toContain("if v_grants > 0 then");
    expect(sql).toContain("legacy grants without explicit payment-confirmation provenance");
    expect(sql).toContain("check (slot_number between 1 and 100)");
    expect(sql).toContain("unique (slot_number)");

    const counter = section(
      "create or replace function public.active_founder_seat_count()",
      "revoke execute on function public.active_founder_seat_count()",
    );
    expect(counter).toContain("from public.founder_seat_ledger");
    expect(counter).not.toContain("public.subscriptions");

    const trigger = section(
      "create or replace function public.enforce_founder_100_cap()",
      "revoke execute on function public.enforce_founder_100_cap()",
    );
    expect(trigger).toContain("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    expect(trigger).toContain("new.source <> 'upgrade_request'");
    expect(trigger).toContain("request.payment_confirmed_amount_thb = 299");
    expect(trigger).toContain("from generate_series(1, 100)");
    expect(trigger).toContain("Founder 100 is full");
  });

  it("keeps payment evidence browser-append-only and visible only to admins", () => {
    const auditTable = section(
      "create table public.membership_payment_confirmations",
      "-- Compatibility name retained",
    );
    expect(auditTable).toContain("idempotency_key uuid not null unique");
    expect(auditTable).toContain("amount_thb integer not null");
    expect(auditTable).toContain("payment_reference text not null");
    expect(auditTable).toContain("payment_reference_fingerprint text generated always as");
    expect(auditTable).toContain("extensions.digest(");
    expect(auditTable).toContain("'sha256'");
    expect(auditTable).toContain(
      "on public.membership_payment_confirmations(payment_reference_fingerprint)",
    );
    expect(auditTable).not.toContain(
      "on public.membership_payment_confirmations(lower(btrim(payment_reference)))",
    );
    expect(auditTable).not.toMatch(/slip|image|storage/i);
    expect(auditTable).toContain("enable row level security");
    expect(auditTable).toContain("using (public.is_admin())");
    expect(auditTable).toContain("revoke all on table public.membership_payment_confirmations from anon, authenticated");
    expect(auditTable).toContain("grant select on table public.membership_payment_confirmations to authenticated");
    expect(auditTable).toContain("Membership payment confirmations are append-only");
    expect(auditTable).toContain("before update or delete on public.membership_payment_confirmations");
  });

  it("disables payment-free activation and renewal paths", () => {
    expect(sql).toContain("approve_upgrade_request is disabled; use confirm_membership_payment");
    expect(sql).toContain("renew_subscription is disabled; use confirm_subscription_renewal");
    expect(sql).toContain("Founder grants require confirm_membership_payment");
    expect(sql).toContain(
      "revoke execute on function public.approve_upgrade_request(uuid) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke execute on function public.renew_subscription(uuid) from public, anon, authenticated",
    );
  });

  it("renews annual plans at the catalogue renewal price and revives expired access", () => {
    const renewal = section(
      "create function public.confirm_subscription_renewal(",
      "revoke execute on function public.confirm_subscription_renewal",
    );
    expect(renewal).toContain("v_subscription.status not in ('active', 'past_due', 'expired')");
    expect(renewal).toContain("coalesce(v_plan.renewal_price_amount_thb, v_plan.price_amount_thb)");
    expect(renewal).toContain("v_subscription.status = 'expired'");
    expect(renewal).toContain("then v_confirmed_at + interval '1 year'");
    expect(renewal).toContain("else v_subscription.current_period_end + interval '1 year'");
    expect(renewal).toContain("set plan = v_subscription.plan_id");
    expect(renewal.match(/'new_period_end'/g)).toHaveLength(1);
  });

  it("does not delete or truncate preserved membership data", () => {
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/delete\s+from/i);
    expect(executable).not.toMatch(/truncate/i);
    expect(executable).not.toMatch(/drop\s+table/i);
  });
});
