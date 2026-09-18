import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

const catalogueSql = migration("20260901090000_017_membership_catalog_and_capabilities.sql");
const subscriptionsSql = migration("20260901090100_018_subscriptions_and_legacy_backfill.sql");
const membershipSql = migration("20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql");
const safetySql = migration("20260901090300_020_membership_safety_guards.sql");

describe("Phase 1B membership migration invariants", () => {
  it("keeps legacy plans hidden and unavailable for new upgrades", () => {
    expect(catalogueSql).toMatch(/'plus'[\s\S]*?'legacy',[\s\S]*?false,[\s\S]*?false/);
    expect(catalogueSql).toMatch(/'lifetime'[\s\S]*?'retired',[\s\S]*?false,[\s\S]*?false/);
    expect(membershipSql).toContain("v_plan.lifecycle_status = 'legacy' and p_source <> 'upgrade_request'");
  });

  it("backfills every known non-free profile before validating the plan foreign key", () => {
    const backfill = subscriptionsSql.indexOf("insert into public.subscriptions");
    const foreignKey = subscriptionsSql.indexOf("add constraint profiles_plan_fkey");
    expect(backfill).toBeGreaterThan(-1);
    expect(foreignKey).toBeGreaterThan(backfill);
    expect(subscriptionsSql).toContain("where p.plan <> 'free'");
    expect(subscriptionsSql).toContain("preserved_without_expiry");
  });

  it("serializes Founder allocation before counting and rejects the 101st seat", () => {
    const lock = membershipSql.indexOf("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    const count = membershipSql.indexOf("select count(*) into v_founder_count");
    const cap = membershipSql.indexOf("if v_founder_count >= 100");
    const insert = membershipSql.indexOf("insert into public.subscriptions", cap);
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);
    expect(cap).toBeGreaterThan(count);
    expect(insert).toBeGreaterThan(cap);
  });

  it("resolves approval through one server transaction and blocks direct status updates", () => {
    const approveStart = membershipSql.indexOf("create function public.approve_upgrade_request");
    const approveEnd = membershipSql.indexOf("create function public.decline_upgrade_request");
    const approveSql = membershipSql.slice(approveStart, approveEnd);
    expect(approveSql).toContain("public.activate_membership_internal");
    expect(approveSql).toContain("set status = 'approved'");
    expect(membershipSql).toContain('drop policy if exists "upgrade_requests_admin_update"');
  });

  it("uses a capability in Storage RLS and guards the profile plan cache", () => {
    expect(membershipSql).toContain("public.has_feature('download.premium')");
    expect(membershipSql).toContain("create trigger trg_enforce_membership_plan_change");
    expect(membershipSql).toContain("Plan changes must use a membership RPC");
  });

  it("does not delete profiles, subscriptions, events, or upgrade requests", () => {
    const executableSql = `${catalogueSql}\n${subscriptionsSql}\n${membershipSql}\n${safetySql}`
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executableSql).not.toMatch(/delete\s+from\s+public\.(profiles|subscriptions|subscription_events|upgrade_requests)/i);
    expect(executableSql).not.toMatch(/truncate/i);
  });

  it("caps Founder at 100 distinct members ever, including expired history", () => {
    const trigger = safetySql.slice(
      safetySql.indexOf("create function public.enforce_founder_100_cap"),
      safetySql.indexOf("create trigger trg_enforce_founder_100_cap"),
    );
    expect(trigger).toContain("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    expect(trigger).toContain("count(distinct user_id)");
    expect(trigger).not.toMatch(/status\s+in\s*\(/i);
    expect(trigger).toContain(">= 100");
  });

  it("enforces Free saved-resource limits under a per-user lock", () => {
    expect(safetySql).toContain("pg_advisory_xact_lock(hashtextextended('saved-resources:' || new.user_id::text, 0))");
    expect(safetySql).toContain("feature_id = 'favorites.enabled'");
    expect(safetySql).toContain("feature_id = 'favorites.limit'");
    expect(safetySql).toContain("count(*) from public.saved_resources where user_id = new.user_id");
  });

  it("does not renew cancelled, revoked, or perpetual legacy subscriptions", () => {
    const renew = safetySql.slice(safetySql.indexOf("create or replace function public.renew_subscription"));
    expect(renew).toContain("status not in ('active', 'past_due')");
    expect(renew).toContain("v_subscription.source = 'legacy'");
    expect(renew).toContain("v_subscription.current_period_end is null");
    expect(renew).toContain("v_plan.lifecycle_status <> 'active'");
    expect(renew).toContain("when v_subscription.plan_id = 'founder' then 299");
    expect(renew.indexOf("pg_advisory_xact_lock")).toBeLessThan(renew.indexOf("for update"));
  });

  it("requires an upgrade request to be pending and entitles only the current published file", () => {
    expect(safetySql).toContain("and status = 'pending'");
    expect(safetySql).toContain("and resolved_at is null");
    expect(safetySql).toContain("r.file_path = storage.objects.name");
    expect(safetySql).toContain("r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]");
  });
});
