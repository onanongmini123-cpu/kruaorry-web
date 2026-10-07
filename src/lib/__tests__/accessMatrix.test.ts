import { describe, expect, it } from "vitest";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "../entitlement";
import { publicResourceAction, toPublicResource, type PublicResource, type PublicResourceViewer } from "@/app/resources/catalog";
import { resourceAccessCopy } from "@/app/resources/detailCopy";
import { ACCESS_TIER_LABEL, accessLabel, accessTier } from "../resourceAccess";

/**
 * The whole access model in one table: every kind of resource against every
 * kind of viewer. The resource decides its tier (and badge) on its own; the
 * viewer only decides whether the main button opens it or leads to sign-up or
 * upgrade. Admin and owner roles bypass everything except the unavailable tier
 * label.
 */

const id = "11111111-2222-4333-8444-555555555555";
const base = {
  id, status: "published", title: "เกมทดสอบ", meta: "", description: "", category: "ภาษาอังกฤษ",
  delivery_mode: "web_app", cover_image_url: null, tags: [], grade_levels: ["p1"],
  required_plan_ids: [] as string[], required_plan_names: [] as string[],
  is_free: false, is_new: false,
};

const resources = {
  public: toPublicResource({ ...base, access_mode: "public", is_free: true }),
  authenticated: toPublicResource({ ...base, access_mode: "authenticated", is_free: true }),
  plans: toPublicResource({ ...base, access_mode: "plans", required_plan_ids: ["founder", "teacher"], required_plan_names: ["Founder 100", "Teacher"] }),
  locked: toPublicResource({ ...base, access_mode: "locked" }),
} as Record<"public" | "authenticated" | "plans" | "locked", PublicResource>;

const pro = (planId: string): EntitlementSnapshot => ({ ...EMPTY_ENTITLEMENTS, planId });

const viewers: Record<string, PublicResourceViewer> = {
  anonymous: { authenticated: false, role: null, entitlements: EMPTY_ENTITLEMENTS },
  freeMember: { authenticated: true, role: "member", entitlements: EMPTY_ENTITLEMENTS },
  teacherPro: { authenticated: true, role: "member", entitlements: pro("teacher") },
  founder: { authenticated: true, role: "member", entitlements: pro("founder") },
  pendingUpgrade: { authenticated: true, role: "member", entitlements: EMPTY_ENTITLEMENTS, pendingPlanIds: ["teacher"] },
  // The database reports an expired plan as Free; the application must not
  // keep treating the member as Pro.
  expiredPro: { authenticated: true, role: "member", entitlements: EMPTY_ENTITLEMENTS },
  legacyOnly: { authenticated: true, role: "member", entitlements: pro("lifetime") },
  admin: { authenticated: true, role: "admin", entitlements: EMPTY_ENTITLEMENTS },
  owner: { authenticated: true, role: "owner", entitlements: EMPTY_ENTITLEMENTS },
};

type Row = [resource: keyof typeof resources, viewer: keyof typeof viewers, canUse: boolean];
const matrix: Row[] = [
  ["public", "anonymous", true], ["public", "freeMember", true], ["public", "teacherPro", true], ["public", "expiredPro", true],
  ["authenticated", "anonymous", false], ["authenticated", "freeMember", true], ["authenticated", "teacherPro", true],
  ["authenticated", "expiredPro", true], ["authenticated", "pendingUpgrade", true],
  ["plans", "anonymous", false], ["plans", "freeMember", false], ["plans", "teacherPro", true], ["plans", "founder", true],
  ["plans", "pendingUpgrade", false], ["plans", "expiredPro", false], ["plans", "legacyOnly", false],
  ["plans", "admin", true], ["plans", "owner", true],
  ["locked", "anonymous", false], ["locked", "freeMember", false], ["locked", "teacherPro", false], ["locked", "pendingUpgrade", false],
  ["locked", "admin", true], ["locked", "owner", true],
];

describe("who can use what", () => {
  it.each(matrix)("%s resource × %s viewer -> canUse=%s", (resource, viewer, canUse) => {
    expect(publicResourceAction(resources[resource], viewers[viewer]).canUse).toBe(canUse);
  });

  it("opens through the server route and never through the raw destination", () => {
    const open = publicResourceAction(resources.public, viewers.anonymous);
    expect(open.href).toBe(`/api/resources/${id}/open`);
    const file = toPublicResource({ ...base, delivery_mode: "file_download", file_path: `${id}/f.pdf`, access_mode: "plans", required_plan_ids: ["teacher"] })!;
    expect(publicResourceAction(file, viewers.teacherPro).href).toBe(`/download/${id}`);
    expect(JSON.stringify(open)).not.toMatch(/https?:\/\//);
  });
});

describe("the badge belongs to the resource, not the viewer", () => {
  const expectedLabel = { public: "ใช้ฟรี", authenticated: "สมาชิกฟรี", plans: "Teacher Pro", locked: "ยังไม่เปิดให้ใช้งาน" } as const;

  it.each(Object.entries(expectedLabel))("%s is always labelled %s", (mode, label) => {
    const resource = resources[mode as keyof typeof resources];
    expect(accessLabel(resource.accessMode)).toBe(label);
    for (const viewer of Object.values(viewers)) {
      // Whatever the viewer can or cannot do, the label of the resource is the same.
      publicResourceAction(resource, viewer);
      expect(accessLabel(resource.accessMode)).toBe(label);
    }
  });

  it("keeps free, member, Pro and unavailable distinct tiers with one wording each", () => {
    expect(new Set(Object.values(ACCESS_TIER_LABEL)).size).toBe(4);
    expect(accessTier("public")).toBe("free");
    expect(accessTier("authenticated")).toBe("member");
    expect(accessTier("plans")).toBe("pro");
    expect(accessTier("locked")).toBe("unavailable");
  });
});

describe("the main button leads somewhere sensible for every viewer", () => {
  it("sends visitors to sign up, members to upgrade, and pending members to their status", () => {
    const signup = publicResourceAction(resources.authenticated, viewers.anonymous);
    expect(signup).toMatchObject({ label: "สมัครฟรีเพื่อใช้งาน", locked: true });
    expect(signup.href).toBe("/login?mode=signup&next=%2Fapp");

    for (const viewer of ["anonymous", "freeMember", "expiredPro"] as const) {
      const upgrade = publicResourceAction(resources.plans, viewers[viewer]);
      expect(upgrade.label, viewer).toBe("ใช้ด้วย Teacher Pro");
      expect(upgrade.href, viewer).toBe(`/membership?plan=founder&returnTo=${encodeURIComponent(`/resources/${id}`)}`);
    }

    const pending = publicResourceAction(resources.plans, viewers.pendingUpgrade);
    expect(pending.label).toBe("ติดตามคำขออัปเกรด");
    expect(pending.href.startsWith("/membership")).toBe(true);
  });

  it("asks a legacy-only member to check their old rights instead of selling them a plan", () => {
    const legacy = toPublicResource({ ...base, access_mode: "plans", required_plan_ids: ["lifetime"], required_plan_names: ["Lifetime"] })!;
    expect(publicResourceAction(legacy, viewers.freeMember).label).toBe("ตรวจสอบสิทธิ์สมาชิกเดิม");
    expect(publicResourceAction(legacy, viewers.anonymous).label).toBe("เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์เดิม");
  });

  it("never offers an action on a resource that is not open yet, except to staff", () => {
    for (const viewer of ["anonymous", "freeMember", "teacherPro"] as const) {
      expect(publicResourceAction(resources.locked, viewers[viewer])).toMatchObject({ canUse: false, label: "ยังไม่เปิดให้ใช้งาน" });
    }
    expect(publicResourceAction(resources.locked, viewers.admin).canUse).toBe(true);
  });

  it("explains each situation in customer words with no implementation wording", () => {
    for (const mode of Object.keys(resources) as (keyof typeof resources)[]) {
      for (const [name, viewer] of Object.entries(viewers)) {
        const action = publicResourceAction(resources[mode], viewer);
        const copy = resourceAccessCopy(resources[mode], viewer, action);
        const text = `${copy.coverCaption} ${copy.heading} ${copy.description}`;
        expect(text, `${mode} × ${name}`).not.toMatch(/null|signed url|supabase|\brls\b|jwt|database|premium|พรีเมียม/i);
        expect(copy.heading.length, `${mode} × ${name}`).toBeGreaterThan(0);
      }
    }
  });

  it("flags a pending upgrade only for the plans that resource accepts", () => {
    const copy = resourceAccessCopy(resources.plans, viewers.pendingUpgrade, publicResourceAction(resources.plans, viewers.pendingUpgrade));
    expect(copy.upgradePending).toBe(true);
    const other: PublicResourceViewer = { ...viewers.pendingUpgrade, pendingPlanIds: ["school"] };
    expect(resourceAccessCopy(resources.plans, other, publicResourceAction(resources.plans, other)).upgradePending).toBe(false);
  });
});
