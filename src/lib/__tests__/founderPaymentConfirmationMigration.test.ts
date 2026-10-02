import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const reconciliationArtifactPaths = [
  "supabase/migrations/20261001190000_048_founder_payment_confirmation.sql",
  "supabase/migrations/README.md",
  "scripts/test-membership-sql.mjs",
] as const;
const reconciliationArtifacts = reconciliationArtifactPaths.map((path) => ({
  path,
  content: readFileSync(join(process.cwd(), path), "utf8"),
}));
const sql = reconciliationArtifacts[0].content;

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
      "resolved_by",
      "resolution_reason_code",
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
    expect(sql).toContain("v_duplicate_pending_users <> 0");
    expect(sql).toContain("expected no duplicate-pending member after the reviewed cleanup");
    expect(sql).toContain("Never embed account, request or payment IDs in");
  });

  it("delegates transaction control to the runner and keeps fail-closed locks", () => {
    const explicitTransactionControl = /^\s*(?:begin|commit|rollback)\s*;\s*$/gim;

    expect(sql).not.toMatch(explicitTransactionControl);
    expect(sql).not.toMatch(/--\s*pg-delta:\s*transaction\s*=\s*false/i);
    expect(sql).toContain("Supabase's migration runner owns the outer transaction");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('membership-payment-schema-v1', 0))");
    const tableLockIndex = sql.indexOf("lock table");
    const founderLockIndex = sql.indexOf(
      "pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))",
    );
    expect(tableLockIndex).toBeGreaterThanOrEqual(0);
    expect(founderLockIndex).toBeGreaterThan(tableLockIndex);
    expect(sql).toMatch(
      /lock table\s+public\.upgrade_requests,\s+public\.subscriptions,\s+public\.founder_seat_ledger,\s+public\.plans,\s+public\.features\s+in access exclusive mode/,
    );
    expect(sql).toContain("partial schema detected");
    expect(sql).toContain("membership_application_resolution_audit");
    expect(sql).toContain("upgrade_requests_one_pending_per_user");
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
    expect(confirm).toMatch(/set\s+status = 'approved'/);
    expect(confirm).toContain("resolution_reason_code = 'payment_confirmed'");
    expect(confirm).toContain("insert into public.membership_application_resolution_audit");
  });

  it("keeps application resolutions append-only with machine-readable reasons", () => {
    const resolutionAudit = section(
      "create table public.membership_application_resolution_audit",
      "-- Founder grants are permanent financial history",
    );
    expect(resolutionAudit).toContain("request_id uuid not null");
    expect(resolutionAudit).toContain("application_reference_code text not null");
    expect(resolutionAudit).toContain("reason_code text not null");
    expect(resolutionAudit).toContain("constraint membership_application_resolution_once unique (request_id)");
    expect(resolutionAudit).toContain("using (public.is_admin())");
    expect(resolutionAudit).toContain("Membership application resolution audit is append-only");
    expect(resolutionAudit).toContain("before update or delete on public.membership_application_resolution_audit");

    const decline = section(
      "create or replace function public.decline_upgrade_request(p_request_id uuid)",
      "revoke execute on function public.decline_upgrade_request(uuid)",
    );
    expect(decline).toContain("resolution_reason_code = 'admin_declined'");
    expect(decline).toContain("'pending', 'declined', 'admin_declined'");
    expect(decline).toContain("resolved_by = v_actor_id");
  });

  it("reconciles only the exact reviewed owner test pair without embedding identity", () => {
    const preflight = section(
      "-- The only reviewed duplicate is an owner-owned Founder/Teacher test pair",
      "-- Payment references remain readable only in the protected audit table",
    );
    const reconciliation = section(
      "-- Reconcile the reviewed owner-only test applications only after the audit",
      "create unique index upgrade_requests_one_pending_per_user",
    );

    for (const timestamp of [
      "2026-10-01 12:48:53.40514+00",
      "2026-10-01 12:49:04.996398+00",
    ]) {
      expect(preflight).toContain(timestamp);
      expect(reconciliation).toContain(timestamp);
    }

    for (const timestamp of [
      "2026-10-02 02:30:47.860132+00",
      "2026-10-02 02:30:48.6291+00",
    ]) {
      expect(preflight).toContain(timestamp);
      expect(reconciliation).toContain(timestamp);
    }

    expect(preflight).toContain("'founder'");
    expect(preflight).toContain("'teacher'");
    expect(preflight).toContain("'owner'");
    expect(preflight).toContain("status = 'declined'");
    expect(preflight).toContain("resolved_at is not null");
    expect(preflight).toContain("request.resolved_at >= request.created_at");
    expect(preflight).toContain("v_target_owner_pending_count <> 0");
    expect(preflight).toContain("public.subscriptions");
    expect(preflight).toContain("plan_id = 'plus'");
    expect(preflight).toContain("raise exception");
    expect(preflight).toMatch(/count\(\*\)[\s\S]*<>\s*2/i);

    expect(reconciliation).toContain("resolution_reason_code = 'owner_test_cleanup'");
    expect(reconciliation).toContain("insert into public.membership_application_resolution_audit");
    expect(reconciliation).toMatch(/'pending',\s*'declined',\s*'owner_test_cleanup'/);
    expect(reconciliation).toContain("v_target_reviewed_count <> 2");
    expect(reconciliation).toContain("v_reconciled_count <> 2");
    expect(reconciliation).toContain("v_audit_count <> 2");
    expect(reconciliation).toContain("audit.resolved_by is null");
    expect(reconciliation).toContain("request.resolved_by is null");
    expect(reconciliation).toContain("request.resolved_at = audit.resolved_at");
    expect(reconciliation).toContain("request.resolved_at >= request.created_at");
    expect(reconciliation).toContain("resolved_at");
    expect(reconciliation).toContain("resolved_by");
    expect(reconciliation).toContain("payment_reported_at is null");
    expect(reconciliation).toContain("payment_confirmed_at is null");
    expect(reconciliation).toContain("public.subscriptions");
    expect(reconciliation).toContain("plan_id = 'plus'");
    expect(reconciliation).toContain("public.founder_seat_ledger");
    expect(reconciliation).toContain("cleanup must not consume a Founder seat");
    expect(reconciliation).toContain("raise exception");

    const executableReconciliation = reconciliation
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executableReconciliation).not.toMatch(
      /\b(?:update|insert\s+into|delete\s+from)\s+public\.(?:profiles|subscriptions|founder_seat_ledger)\b/i,
    );
    expect(executableReconciliation).not.toMatch(
      /set\s+(?:status|resolved_at|resolved_by)\s*=/i,
    );

  });

  it("keeps every reconciliation artifact free of identity and plausible payment references", () => {
    const uuidLiteral = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i;
    const emailLiteral = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
    const thaiMobileLiteral = /\b(?:\+66|0)[689](?:[-\s]?\d){8}\b/;
    const mixedReferenceCandidate =
      /\b(?=[A-Za-z0-9-]{12,}\b)(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+\b/g;
    const isKnownNonPaymentToken = (value: string) =>
      /^20\d{2}-\d{2}-\d{2}T\d{2}$/.test(value) ||
      /^[0-9a-f]{40}$/.test(value) ||
      /^\d+-(?:question|sentence)$/.test(value) ||
      value === "membership-payment-schema-v1" ||
      /^(?:founder|teacher)(?:-[a-z]+)*-(?:payment|renewal)(?:-[a-z]+)*-\d{3}$/i.test(value);

    for (const artifact of reconciliationArtifacts) {
      expect(artifact.content, `${artifact.path} contains a literal UUID`).not.toMatch(uuidLiteral);
      expect(artifact.content, `${artifact.path} contains an email literal`).not.toMatch(emailLiteral);
      expect(artifact.content, `${artifact.path} contains a Thai mobile literal`).not.toMatch(
        thaiMobileLiteral,
      );

      const unexpectedLongNumbers = [...artifact.content.matchAll(/\b\d{10,}\b/g)]
        .map(([value]) => value)
        .filter((value) => !/^20\d{12}$/.test(value));
      expect(
        unexpectedLongNumbers,
        `${artifact.path} contains a plausible numeric payment reference`,
      ).toEqual([]);

      const singleLineStringLiterals = [
        ...artifact.content.matchAll(/(["'`])([^\r\n"'`]{1,200})\1/g),
      ].map((match) => match[2]);
      const unexpectedMixedReferences = singleLineStringLiterals
        .flatMap((literal) => [...literal.matchAll(mixedReferenceCandidate)].map(([value]) => value))
        .filter((value) => !isKnownNonPaymentToken(value));
      expect(
        unexpectedMixedReferences,
        `${artifact.path} contains a plausible mixed payment reference`,
      ).toEqual([]);
    }
  });

  it("skips reconciliation only for a pristine zero-request replay", () => {
    const preflight = section(
      "select count(*)::integer into v_all_request_count",
      "-- Payment references remain readable only in the protected audit table",
    );
    const reconciliation = section(
      "-- Reconcile the reviewed owner-only test applications only after the audit",
      "create unique index upgrade_requests_one_pending_per_user",
    );

    expect(sql.match(/if v_all_request_count = 0 then/g)).toHaveLength(2);

    expect(preflight).toContain("select count(*)::integer into v_all_request_count");
    expect(preflight).toContain(
      "-- A pristine migration replay has no application history to reconcile",
    );
    expect(preflight).toContain("if v_all_request_count = 0 then");
    expect(preflight.indexOf("else")).toBeLessThan(
      preflight.indexOf("-- The only reviewed duplicate is an owner-owned Founder/Teacher test pair"),
    );
    expect(preflight).toContain("v_target_count <> 2");
    expect(preflight).toContain(
      "the exact Founder/Teacher pair does not match the reviewed production audit",
    );

    expect(reconciliation).toContain("-- A pristine replay has no rows to resolve or audit");
    expect(reconciliation).toContain("if v_all_request_count = 0 then");
    expect(reconciliation.indexOf("else")).toBeLessThan(
      reconciliation.indexOf("v_target_count <> 2"),
    );
    expect(reconciliation).toContain("v_target_reviewed_count <> 2");
    expect(reconciliation).toContain("reviewed applications changed before cleanup");
  });

  it("creates pending-user uniqueness only after the exact reconciliation", () => {
    const reconciliationIndex = sql.indexOf(
      "-- Reconcile the reviewed owner-only test applications only after the audit",
    );
    const cleanupIndex = sql.indexOf("resolution_reason_code = 'owner_test_cleanup'", reconciliationIndex);
    const auditIndex = sql.indexOf(
      "insert into public.membership_application_resolution_audit",
      reconciliationIndex,
    );
    const uniqueIndex = sql.indexOf("create unique index upgrade_requests_one_pending_per_user");

    expect(reconciliationIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThan(reconciliationIndex);
    expect(auditIndex).toBeGreaterThan(cleanupIndex);
    expect(uniqueIndex).toBeGreaterThan(auditIndex);
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

  it("publishes readiness only after the RPCs and postcondition assertions", () => {
    const marker = "system.membership_payment_confirmation_v1_ready";
    const markerIndex = sql.lastIndexOf(marker);
    const postconditionIndex = sql.lastIndexOf("Postconditions run before publishing the readiness marker");
    const declineIndex = sql.lastIndexOf("create or replace function public.decline_upgrade_request");

    expect(markerIndex).toBeGreaterThan(postconditionIndex);
    expect(markerIndex).toBeGreaterThan(declineIndex);
    expect(sql.slice(markerIndex)).not.toContain("plan_features");
    expect(sql.trimEnd()).toMatch(/\);$/);
  });
});
