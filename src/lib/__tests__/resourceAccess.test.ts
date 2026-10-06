import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Gamepad2 } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ResourceCard } from "@/components/ui/ResourceCard";
import { publicResourceAction, requiredPlansLabel, toPublicResource } from "@/app/resources/catalog";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "@/lib/entitlement";
import { ACCESS_TIER_LABEL, accessDescription, accessLabel, accessTier } from "@/lib/resourceAccess";

const id = "11111111-2222-4333-8444-555555555555";
const row = {
  id,
  status: "published",
  title: "เกมทดสอบ",
  meta: "เกม",
  description: "",
  category: "เกม",
  delivery_mode: "web_app",
  cover_image_url: null,
  tags: [],
  grade_levels: ["p4"],
  access_mode: "public",
  required_plan_ids: [] as string[],
  required_plan_names: [] as string[],
  is_free: true,
  is_new: false,
};

const teacherEntitlements = { ...EMPTY_ENTITLEMENTS, planId: "teacher" } as EntitlementSnapshot;

function resource(overrides: Record<string, unknown>) {
  const item = toPublicResource({ ...row, ...overrides });
  if (!item) throw new Error("fixture rejected");
  return item;
}

function badgeFor(item: ReturnType<typeof resource>, viewer: { authenticated: boolean; entitled?: boolean; pending?: boolean }) {
  const action = publicResourceAction(item, {
    authenticated: viewer.authenticated,
    role: viewer.authenticated ? "member" : null,
    entitlements: viewer.entitled ? teacherEntitlements : EMPTY_ENTITLEMENTS,
    pendingPlanIds: viewer.pending ? item.requiredPlanIds : [],
  });
  const html = renderToStaticMarkup(React.createElement(ResourceCard, {
    title: item.title,
    meta: item.meta,
    affordance: item.deliveryMode,
    tags: [],
    icon: Gamepad2,
    accessTier: accessTier(item.accessMode),
    requiredPlanNames: item.requiredPlanNames,
    locked: action.locked,
    upgradePending: viewer.pending,
    unavailable: item.accessMode === "locked",
  }));
  return { action, html, label: accessLabel(item.accessMode) };
}

describe("resource access tier is independent from the viewer's entitlement", () => {
  it("uses the three customer-facing labels plus an unavailable label", () => {
    expect(ACCESS_TIER_LABEL).toEqual({
      free: "ใช้ฟรี",
      member: "สมาชิกฟรี",
      pro: "Teacher Pro",
      unavailable: "ยังไม่เปิดให้ใช้งาน",
    });
    expect(accessDescription("public")).toBe("เปิดใช้ได้ทันที ไม่ต้องสมัคร");
    expect(accessDescription("authenticated")).toBe("สมัครบัญชีฟรีเพื่อใช้งาน");
    expect(accessDescription("plans")).toBe("สำหรับสมาชิก Teacher Pro");
  });

  const plansRow = { access_mode: "plans", required_plan_ids: ["teacher"], required_plan_names: ["Teacher"], is_free: false };

  const cases = [
    { name: "public + accessible", item: { access_mode: "public" }, viewer: { authenticated: false }, label: "ใช้ฟรี", canUse: true },
    { name: "authenticated + logged out", item: { access_mode: "authenticated" }, viewer: { authenticated: false }, label: "สมาชิกฟรี", canUse: false },
    { name: "authenticated + logged in", item: { access_mode: "authenticated" }, viewer: { authenticated: true }, label: "สมาชิกฟรี", canUse: true },
    { name: "plans + no entitlement", item: plansRow, viewer: { authenticated: true }, label: "Teacher Pro", canUse: false },
    { name: "plans + has entitlement", item: plansRow, viewer: { authenticated: true, entitled: true }, label: "Teacher Pro", canUse: true },
    { name: "plans + pending upgrade", item: plansRow, viewer: { authenticated: true, pending: true }, label: "Teacher Pro", canUse: false },
    { name: "locked", item: { access_mode: "locked" }, viewer: { authenticated: true }, label: "ยังไม่เปิดให้ใช้งาน", canUse: false },
  ];

  for (const c of cases) {
    it(`${c.name} -> ${c.label}`, () => {
      const { action, html, label } = badgeFor(resource(c.item), c.viewer);
      expect(label).toBe(c.label);
      expect(html).toContain(c.label);
      expect(action.canUse).toBe(c.canUse);
    });
  }

  it("never shows the Teacher Pro badge on a non-plan resource, or a free badge on a plan resource", () => {
    const member = badgeFor(resource({ access_mode: "authenticated" }), { authenticated: true });
    expect(member.html).not.toContain("Teacher Pro");
    const pro = badgeFor(resource(plansRow), { authenticated: true, entitled: true });
    expect(pro.html).not.toContain("สมาชิกฟรี");
    expect(pro.html).not.toContain("ใช้ฟรี");
  });

  it("keeps the badge identical whether or not the viewer can open a plan resource", () => {
    const item = resource(plansRow);
    const locked = badgeFor(item, { authenticated: true });
    const entitled = badgeFor(item, { authenticated: true, entitled: true });
    expect(locked.label).toBe(entitled.label);
    expect(locked.action.canUse).toBe(false);
    expect(entitled.action.canUse).toBe(true);
    expect(entitled.html).toContain("Teacher Pro");
  });
});

describe("requiredPlansLabel keeps real plan names", () => {
  it("lists every required plan name instead of collapsing to the generic badge", () => {
    const item = resource({
      access_mode: "plans",
      required_plan_ids: ["founder", "teacher"],
      required_plan_names: ["Founder 100", "Teacher"],
      is_free: false,
    });
    expect(requiredPlansLabel(item)).toBe("Founder 100 หรือ Teacher Pro");
    expect(accessLabel(item.accessMode)).toBe("Teacher Pro");
  });

  it("exposes the real plan names to assistive tech beside the Teacher Pro badge", () => {
    const item = resource({
      access_mode: "plans",
      required_plan_ids: ["founder", "teacher"],
      required_plan_names: ["Founder 100", "Teacher"],
      is_free: false,
    });
    const { html } = badgeFor(item, { authenticated: true });
    expect(html).toContain("Teacher Pro");
    expect(html).toContain("Founder 100 / Teacher Pro");
  });

  it("falls back to the generic label only when no plan names are known", () => {
    const item = resource({ access_mode: "plans", required_plan_ids: [], required_plan_names: [], is_free: false });
    expect(requiredPlansLabel(item)).toBe("Teacher Pro");
  });

  it("does not use retired marketing words for non-plan modes", () => {
    for (const mode of ["public", "authenticated", "locked"] as const) {
      const label = requiredPlansLabel(resource({ access_mode: mode }));
      expect(label).not.toMatch(/พรีเมียม|Premium|สำหรับสมาชิก|Member only/i);
    }
  });
});
