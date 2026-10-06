import { describe, expect, it } from "vitest";
import { membershipUpgradeHref, PUBLIC_RESOURCE_SELECT, publicResourceAction, requiredPlansLabel, signupHref, toPublicResource } from "../catalog";
import { FREE_SIGNUP_HREF } from "@/lib/authReturnPath";
import { EMPTY_ENTITLEMENTS } from "@/lib/entitlement";

const id = "11111111-2222-4333-8444-555555555555";
const base = {
  id,
  status: "published",
  title: "ใบงานคณิตศาสตร์ ป.4",
  meta: "ใบงานพร้อมเฉลย",
  description: "ดูรายละเอียดก่อนดาวน์โหลด",
  category: "คณิตศาสตร์",
  delivery_mode: "file_download",
  cta_url: null,
  file_path: `${id}/worksheet.pdf`,
  cover_image_url: "https://images.example.org/worksheet.png",
  tags: ["ป.4", "ใบงาน"],
  grade_levels: ["p4"],
  access_mode: "authenticated",
  required_plan_ids: [],
  required_plan_names: [],
  is_free: true,
  is_new: true,
  featured_rank: 1,
  review_average: 4.5,
  review_count: 2,
  file_name: "worksheet.pdf",
};

describe("public resource showcase", () => {
  it("shows a genuine published free file and uses the canonical free signup route", () => {
    const item = toPublicResource(base);
    expect(item?.title).toBe(base.title);
    expect(item?.isFree).toBe(true);
    expect(item?.isNew).toBe(true);
    expect(signupHref()).toBe(FREE_SIGNUP_HREF);
    expect(signupHref()).toBe("/login?mode=signup&next=%2Fapp");
  });

  it("supports a real same-origin premium web app but routes guests to intentional upgrade", () => {
    const item = toPublicResource({ ...base, delivery_mode: "web_app", file_path: null, cta_url: "/tools/timer", access_mode: "plans", required_plan_ids: ["teacher"], is_free: false });
    expect(item).not.toBeNull();
    expect(publicResourceAction(item!, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    })).toMatchObject({
      href: `/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`,
      label: "ใช้ด้วย Teacher Pro",
    });
  });

  it("never puts private destinations into the public page model", () => {
    const item = toPublicResource({ ...base, delivery_mode: "google_template", cta_url: "https://private.example/?token=SECRET", file_path: "private/path" });
    expect(JSON.stringify(item)).not.toMatch(/SECRET|private\/path|worksheet[.]pdf/);
    expect(PUBLIC_RESOURCE_SELECT).toContain("grade_levels");
    expect(PUBLIC_RESOURCE_SELECT).toContain("required_plan_names");
    expect(PUBLIC_RESOURCE_SELECT).toContain("access_mode");
    expect(PUBLIC_RESOURCE_SELECT).toContain("featured_rank");
    expect(PUBLIC_RESOURCE_SELECT).toContain("is_new");
    expect(PUBLIC_RESOURCE_SELECT).not.toMatch(/cta_url|file_path|file_name/);
  });

  it("keeps safe metadata and structured grades while allowing a missing cover fallback", () => {
    const item = toPublicResource({
      ...base,
      is_free: false,
      access_mode: "plans",
      cover_image_url: null,
      required_plan_ids: ["founder", "teacher"],
      required_plan_names: ["Founder 100", "Teacher", "Teacher"],
    });

    expect(item).toMatchObject({
      coverImageUrl: null,
      gradeLevels: ["p4"],
      requiredPlanNames: ["Founder 100", "Teacher Pro"],
      requiredPlanIds: ["founder", "teacher"],
      isNew: true,
      featuredRank: 1,
      reviewAverage: 4.5,
      reviewCount: 2,
    });
    expect(requiredPlansLabel(item!)).toBe("Founder 100 หรือ Teacher Pro");
  });

  it("keeps hidden legacy and saleable Teacher plans distinct when name arrays are misaligned", () => {
    const item = toPublicResource({
      ...base,
      access_mode: "plans",
      required_plan_ids: ["teacher_pro", "teacher"],
      required_plan_names: ["Teacher"],
    });

    expect(item?.requiredPlanIds).toEqual(["teacher_pro", "teacher"]);
    expect(item?.requiredPlanNames).toEqual(["Teacher Pro (แพ็กเดิม)", "Teacher Pro"]);
    expect(membershipUpgradeHref(item!)).toContain("plan=teacher");
  });

  it("routes retired-plan-only media to an existing-rights check without advertising a saleable pack", () => {
    const item = toPublicResource({
      ...base,
      access_mode: "plans",
      required_plan_ids: ["plus", "lifetime"],
      required_plan_names: ["Plus", "Lifetime"],
    })!;

    expect(publicResourceAction(item, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    })).toMatchObject({
      label: "เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์เดิม",
      href: `/membership?returnTo=${encodeURIComponent(`/resources/${id}`)}`,
      locked: true,
    });
  });

  it("fails closed for drafts and invalid ids", () => {
    expect(toPublicResource({ ...base, status: "draft" })).toBeNull();
    expect(toPublicResource({ ...base, id: "../admin" })).toBeNull();
  });

  it("maps only an explicit database-derived new flag", () => {
    expect(toPublicResource({ ...base, is_new: false })?.isNew).toBe(false);
    expect(toPublicResource({ ...base, is_new: null })?.isNew).toBe(false);
    expect(toPublicResource({ ...base, is_new: "true" })?.isNew).toBe(false);
  });

  it("uses safe session-aware actions for guests, free members, paid members, and admins", () => {
    const free = toPublicResource(base)!;
    const premium = toPublicResource({
      ...base,
      is_free: false,
      access_mode: "plans",
      required_plan_ids: ["founder", "teacher"],
      required_plan_names: ["Founder 100", "Teacher"],
    })!;
    const guest = publicResourceAction(premium, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(guest).toMatchObject({ label: "ใช้ด้วย Teacher Pro", locked: true, canUse: false });
    expect(guest.href).toBe(`/membership?plan=founder&returnTo=${encodeURIComponent(`/resources/${id}`)}`);
    expect(guest.href).not.toContain("mode=signup");
    expect(guest.href).not.toMatch(/file_path|token|worksheet[.]pdf/);

    const guestFree = publicResourceAction(free, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(guestFree).toMatchObject({ label: "สมัครฟรีเพื่อใช้งาน", locked: true, canUse: false });
    expect(guestFree.href).toBe(FREE_SIGNUP_HREF);

    const freeMember = publicResourceAction(premium, {
      authenticated: true,
      role: "member",
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(freeMember).toEqual({
      href: `/membership?plan=founder&returnTo=${encodeURIComponent(`/resources/${id}`)}`,
      label: "ใช้ด้วย Teacher Pro",
      canUse: false,
      locked: true,
      opensNewTab: false,
    });

    const pendingMember = publicResourceAction(premium, {
      authenticated: true,
      role: "member",
      entitlements: EMPTY_ENTITLEMENTS,
      pendingPlanIds: ["founder"],
    });
    expect(pendingMember).toMatchObject({
      href: `/membership?plan=founder&returnTo=${encodeURIComponent(`/resources/${id}`)}`,
      label: "ติดตามคำขออัปเกรด",
      canUse: false,
      locked: true,
    });

    expect(publicResourceAction(premium, {
      authenticated: true,
      role: "member",
      entitlements: EMPTY_ENTITLEMENTS,
      pendingPlanIds: ["unrelated-plan"],
    }).label).toBe("ใช้ด้วย Teacher Pro");

    expect(publicResourceAction(free, {
      authenticated: true,
      role: "member",
      entitlements: EMPTY_ENTITLEMENTS,
    })).toMatchObject({ href: `/download/${id}`, canUse: true, locked: false });

    const paidMember = publicResourceAction(premium, {
      authenticated: true,
      role: "member",
      entitlements: { planId: "teacher", features: { "download.premium": { enabled: true, limit: null } } },
    });
    expect(paidMember).toMatchObject({ href: `/download/${id}`, canUse: true, locked: false });

    const admin = publicResourceAction(premium, {
      authenticated: true,
      role: "admin",
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(admin).toMatchObject({ href: `/download/${id}`, canUse: true, locked: false });

    const premiumWebApp = toPublicResource({
      ...base,
      delivery_mode: "web_app",
      is_free: false,
      access_mode: "plans",
      required_plan_ids: ["teacher"],
      required_plan_names: ["Teacher"],
    })!;
    expect(publicResourceAction(premiumWebApp, {
      authenticated: true,
      role: "member",
      entitlements: { planId: "teacher", features: { "download.premium": { enabled: true, limit: null } } },
    })).toMatchObject({ href: `/api/resources/${id}/open`, canUse: true, locked: false });
  });

  it("opens explicitly public resources for guests without a signup detour", () => {
    const item = toPublicResource({ ...base, access_mode: "public" })!;
    expect(publicResourceAction(item, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    })).toMatchObject({ href: `/download/${id}`, canUse: true, locked: false, opensNewTab: true });
  });

  it("builds only allowlisted internal return paths for a premium upgrade", () => {
    const premium = toPublicResource({
      ...base,
      is_free: false,
      access_mode: "plans",
      required_plan_ids: ["teacher"],
      required_plan_names: ["Teacher"],
    })!;
    expect(membershipUpgradeHref(premium, `/app?resource=${id}`))
      .toBe(`/membership?plan=teacher&returnTo=${encodeURIComponent(`/app?resource=${id}`)}`);
    expect(membershipUpgradeHref(premium, "https://evil.example/steal"))
      .toBe("/membership?plan=teacher&returnTo=%2Fapp");
  });
});
