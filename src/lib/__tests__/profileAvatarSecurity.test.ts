import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(new URL(
  "../../../supabase/migrations/20261004110000_051_deterministic_profile_avatars.sql",
  import.meta.url,
), "utf8");
const clientSource = readFileSync(new URL("../profileAvatar.ts", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../data.ts", import.meta.url), "utf8");

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
      ['create policy "profile_avatars_owner_delete"', '-- Keep all earlier role/identity/plan protections'],
    ] as const) {
      const body = sqlBetween(policy, end);
      expect(body).toContain("bucket_id = 'profile-avatars'");
      expect(body).toContain("owner_id = (select auth.uid())::text");
      expect(body).toContain("'is_anonymous'");
    }

    const insertPolicy = sqlBetween(
      'create policy "profile_avatars_owner_insert"',
      'drop policy if exists "profile_avatars_owner_update"',
    );
    const updatePolicy = sqlBetween(
      'create policy "profile_avatars_owner_update"',
      'drop policy if exists "profile_avatars_owner_delete"',
    );
    const exactKey = "name = 'avatars/' || (select auth.uid())::text || '/avatar.webp'";
    expect(insertPolicy).toContain(exactKey);
    expect(updatePolicy).toContain(exactKey);
    expect(insertPolicy).not.toContain("name ~");
  });

  it("accepts only the caller's exact deterministic object and preserves identity, role and plan", () => {
    const guard = sqlBetween(
      "create or replace function public.prevent_self_privilege_escalation()",
      "revoke all on function public.prevent_self_privilege_escalation()",
    );
    expect(guard).toContain("object.owner_id = new.id::text");
    expect(guard).toContain("new.avatar_path <> 'avatars/' || new.id::text || '/avatar.webp'");
    expect(guard).toContain("new.id := old.id");
    expect(guard).toContain("new.email := old.email");
    expect(guard).toContain("new.plan := old.plan");
    expect(guard).toContain("new.created_at := old.created_at");
    expect(guard).toContain("new.role := old.role");

    const nameRpc = sqlBetween(
      "create or replace function public.update_my_display_name(",
      "revoke all on function public.update_my_display_name(text)",
    );
    expect(nameRpc).toContain("v_user_id uuid := (select auth.uid())");
    expect(nameRpc).toContain("set full_name = v_full_name");
    expect(nameRpc).toContain("where profile.id = v_user_id");
    expect(nameRpc).not.toMatch(/set\s+(avatar_path|role|plan)\s*=/i);

    const avatarRpc = sqlBetween(
      "create or replace function public.update_my_avatar(",
      "revoke all on function public.update_my_avatar(text)",
    );
    expect(avatarRpc).toContain("v_expected_path := 'avatars/' || v_user_id::text || '/avatar.webp'");
    expect(avatarRpc).toContain("object.owner_id = v_user_id::text");
    expect(avatarRpc).toContain("set avatar_path = v_avatar_path");
    expect(avatarRpc).toContain("where profile.id = v_user_id");
    expect(avatarRpc).not.toMatch(/set\s+(full_name|role|plan)\s*=/i);
  });

  it("keeps the compatibility RPC from restoring a stale avatar", () => {
    const compatibilityRpc = sqlBetween(
      "create or replace function public.update_my_profile(",
      "revoke all on function public.update_my_profile(text, text)",
    );
    expect(compatibilityRpc).toContain("perform public.update_my_display_name(p_full_name)");
    expect(compatibilityRpc).not.toContain("set avatar_path");
    expect(compatibilityRpc).not.toContain("p_avatar_path);");
  });

  it("removes table-wide profile writes and retains only guarded role and plan administration", () => {
    expect(migrationSql).toContain("revoke update on table public.profiles from anon, authenticated");
    expect(migrationSql).toContain("grant update (role, plan) on table public.profiles to authenticated");
  });

  it("the browser avatar mutation derives its path from auth and calls only the avatar RPC", () => {
    const helper = clientSource.slice(
      clientSource.indexOf("export async function updateMyAvatar"),
      clientSource.indexOf("async function loadImage"),
    );
    expect(clientSource).toContain("supabase.auth.getUser()");
    expect(clientSource).toContain('supabase.rpc("update_my_avatar"');
    expect(helper).toContain("writeMyAvatarPath(supabase, avatarPath)");
    expect(helper).not.toContain('.update({ avatar_path:');
    expect(helper).not.toMatch(/\b(role|plan|entitlement)\s*:/);
  });

  it("the display-name client cannot send avatar, role, plan, or entitlement fields", () => {
    const helper = dataSource.slice(
      dataSource.indexOf("export async function updateMyDisplayName"),
      dataSource.indexOf("\n}", dataSource.indexOf("export async function updateMyDisplayName")) + 2,
    );
    expect(helper).toContain('supabase.rpc("update_my_display_name"');
    expect(helper).toContain("p_full_name: fullName.trim()");
    expect(helper).not.toMatch(/avatar|role|plan|entitlement/i);
  });
});
