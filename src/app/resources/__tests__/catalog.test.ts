import { describe, expect, it } from "vitest";
import { PUBLIC_RESOURCE_SELECT, publicResourceAction, requiredPlansLabel, signupHref, toPublicResource } from "../catalog";
import { safeAuthNext } from "@/lib/authReturnPath";
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
  it("shows a genuine published free file and sends signup back to its download route", () => {
    const item = toPublicResource(base);
    expect(item?.title).toBe(base.title);
    expect(item?.isFree).toBe(true);
    expect(item?.isNew).toBe(true);
    expect(signupHref(item!)).toBe(`/login?next=${encodeURIComponent(`/download/${id}`)}&mode=signup`);
    expect(safeAuthNext(new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next"))).toBe(`/download/${id}`);
  });

  it("supports a real same-origin web app and routes signup back to its app detail", () => {
    const item = toPublicResource({ ...base, delivery_mode: "web_app", file_path: null, cta_url: "/tools/timer", access_mode: "plans", required_plan_ids: ["teacher"], is_free: false });
    expect(item).not.toBeNull();
    expect(signupHref(item!)).toBe(`/login?next=${encodeURIComponent(`/app?resource=${id}`)}&mode=signup`);
    expect(safeAuthNext(new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next"))).toBe(`/app?resource=${id}`);
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
      requiredPlanNames: ["Founder 100", "Teacher"],
      requiredPlanIds: ["founder", "teacher"],
      isNew: true,
      featuredRank: 1,
      reviewAverage: 4.5,
      reviewCount: 2,
    });
    expect(requiredPlansLabel(item!)).toBe("Founder 100 หรือ Teacher");
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
    expect(guest).toMatchObject({ label: "สมัครสมาชิกเพื่อใช้งาน", locked: true, canUse: false });
    expect(guest.href).not.toMatch(/file_path|token|worksheet[.]pdf/);

    const guestFree = publicResourceAction(free, {
      authenticated: false,
      role: null,
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(guestFree).toMatchObject({ label: "สมัครสมาชิกฟรีเพื่อใช้งาน", locked: true, canUse: false });
    expect(guestFree.href).toContain(encodeURIComponent(`/download/${id}`));

    const freeMember = publicResourceAction(premium, {
      authenticated: true,
      role: "member",
      entitlements: EMPTY_ENTITLEMENTS,
    });
    expect(freeMember).toEqual({
      href: `/app?resource=${id}`,
      label: "อัปเกรดเพื่อปลดล็อก",
      canUse: false,
      locked: true,
      opensNewTab: false,
    });

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
});
