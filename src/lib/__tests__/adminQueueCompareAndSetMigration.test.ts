import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL(
  "../../../supabase/migrations/20261003121000_050_admin_queue_compare_and_set.sql",
  import.meta.url,
), "utf8");

describe("admin queue compare-and-set migration", () => {
  it("guards every admin queue mutation with the workflow facts rendered to the admin", () => {
    expect(sql).toContain("admin_compare_set_request_status");
    expect(sql).toContain("admin_revision = p_expected_revision");
    expect(sql).toContain("admin_revision = admin_revision + 1");
    expect(sql).toContain("admin_compare_set_review_visibility");
    expect(sql).toContain("admin_compare_delete_resource_review");
    expect(sql).toContain("admin_compare_set_resource_issue_status");
    expect(sql).toContain("admin_compare_decline_upgrade_request");
    expect(sql.match(/moderation_status = p_expected_status/g)).toHaveLength(2);
    expect(sql.match(/updated_at is not distinct from p_expected_updated_at/g)).toHaveLength(3);
    expect(sql).toMatch(/moderated_at = current_timestamp,\s+updated_at = current_timestamp/);
    expect(sql.match(/\n    and status = p_expected_status/g)).toHaveLength(2);
    expect(sql).toContain("request.payment_reported_at is not distinct from p_expected_payment_reported_at");
    expect(sql).toContain("request.plan_id = p_expected_plan_id");
    expect(sql).toContain("request.quoted_amount_thb = p_expected_quoted_amount_thb");
    expect(sql).toContain("request.payment_reported_at is not distinct from v_payment_reported_at");
    expect(sql).toContain("request.plan_id = v_plan_id");
    expect(sql).toContain("request.quoted_amount_thb = v_quoted_amount_thb");
    expect(sql.match(/return found;/g)).toHaveLength(4);
  });

  it("removes every legacy bypass and keeps replacements server-authorized", () => {
    expect(sql).toContain("revoke update on table public.requests from authenticated");
    expect(sql).toContain("admin_compare_set_request_status(uuid, text, integer, text)");
    expect(sql).toContain("revoke execute on function public.admin_set_review_visibility(uuid, boolean) from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function public.admin_delete_resource_review(uuid) from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function public.admin_set_resource_issue_status(uuid, text) from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function public.decline_upgrade_request(uuid) from public, anon, authenticated");
    expect(sql.match(/security definer/g)).toHaveLength(5);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(5);
    expect(sql.match(/if not public\.is_admin\(\) then/g)).toHaveLength(5);
    expect(sql.match(/revoke all on function/g)).toHaveLength(5);
    expect(sql.match(/grant execute on function/g)).toHaveLength(5);
    expect(sql).toContain("admin_compare_decline_upgrade_request(uuid, timestamptz, text, integer)");
  });

  it("preserves the immutable decline audit contract from migration 048", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("membership_application_resolution_audit");
    expect(sql).toContain("application_reference_code");
    expect(sql).toContain("'pending', 'declined', 'admin_declined'");
  });

  it("uses additive forward-only DDL without destructive queue rewrites", () => {
    const migrationTimeSql = sql.replace(/as \$\$[\s\S]*?\$\$;/g, "");
    expect(migrationTimeSql).toMatch(/add column admin_revision integer not null default 1/);
    expect(migrationTimeSql).toMatch(/requests_admin_revision_positive check \(admin_revision > 0\)/);
    expect(migrationTimeSql).not.toMatch(/\btruncate\b/i);
    expect(migrationTimeSql).not.toMatch(/\binsert\s+into\b/i);
    expect(migrationTimeSql).not.toMatch(/\bupdate\s+public\./i);
    expect(migrationTimeSql).not.toMatch(/\bdelete\s+from\b/i);
    expect(migrationTimeSql).not.toMatch(/\bdrop\s+(table|column)\b/i);
  });
});
