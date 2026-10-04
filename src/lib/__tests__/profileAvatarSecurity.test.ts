import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(new URL(
  "../../../supabase/migrations/20260925130000_030_member_profile_avatars.sql",
  import.meta.url,
), "utf8");
const clientSource = readFileSync(new URL("../profileAvatar.ts", import.meta.url), "utf8");

function sqlBetween(start: string, end: string): string {
  const startIndex = migrationSql.indexOf(start);
  const endIndex = migrationSql.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing SQL section: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing SQL section end: ${end}`).toBeGreaterThan(startIndex);
  return migrationSql.slice(startIndex, endIndex);
}

describe("profile avatar authorization boundary", () => {
  it("keeps the bucket private, WebP-only and owner-isolated for every object operation", () => {
    expect(migrationSql).toContain("'profile-avatars',\n  'profile-avatars',\n  false,\n  5242880");
    expect(migrationSql).toContain("array['image/webp']");

    for (const [policy, end] of [
      ['create policy "profile_avatars_owner_select"', 'drop policy if exists "profile_avatars_owner_insert"'],
      ['create policy "profile_avatars_owner_insert"', 'drop policy if exists "profile_avatars_owner_update"'],
      ['create policy "profile_avatars_owner_update"', 'drop policy if exists "profile_avatars_owner_delete"'],
      ['create policy "profile_avatars_owner_delete"', '-- Preserve the owner-concurrency guard'],
    ] as const) {
      const body = sqlBetween(policy, end);
      expect(body).toContain("bucket_id = 'profile-avatars'");
      expect(body).toContain("owner_id = (select auth.uid())::text");
      expect(body).toContain("'is_anonymous'");
    }
  });

  it("accepts only owned opaque avatar objects and preserves identity, role and plan", () => {
    const guard = sqlBetween(
      "create or replace function public.prevent_self_privilege_escalation()",
      "revoke all on function public.prevent_self_privilege_escalation()",
    );
    expect(guard).toContain("object.owner_id = new.id::text");
    expect(guard).toContain("new.id := old.id");
    expect(guard).toContain("new.email := old.email");
    expect(guard).toContain("new.plan := old.plan");
    expect(guard).toContain("new.created_at := old.created_at");
    expect(guard).toContain("new.role := old.role");

    const rpc = sqlBetween(
      "create or replace function public.update_my_profile(",
      "revoke all on function public.update_my_profile(text, text)",
    );
    expect(rpc).toContain("v_user_id uuid := (select auth.uid())");
    expect(rpc).toContain("object.owner_id = v_user_id::text");
    expect(rpc).toContain("where profile.id = v_user_id");
    expect(rpc).not.toMatch(/set\s+(role|plan)\s*=/i);
  });

  it("the browser mutation derives its target from validated auth and sends only avatar_path", () => {
    const helper = clientSource.slice(
      clientSource.indexOf("export async function updateMyAvatar"),
      clientSource.indexOf("async function loadImage"),
    );
    expect(helper).toContain("supabase.auth.getUser()");
    expect(helper).toContain('.update({ avatar_path: avatarPath })');
    expect(helper).toContain('.eq("id", authData.user.id)');
    expect(helper).not.toMatch(/\b(role|plan|entitlement)\s*:/);
  });
});
