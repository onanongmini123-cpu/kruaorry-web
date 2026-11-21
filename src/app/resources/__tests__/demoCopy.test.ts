import { describe, expect, it } from "vitest";
import { DEMO_BUTTON_LABEL, resourceDemoView } from "../demoCopy";
import { publicResourceAction, type PublicResource, type PublicResourceViewer } from "../catalog";
import { EMPTY_ENTITLEMENTS } from "@/lib/entitlement";

const DEMO = "https://games.kruaorry.com/demo/vocab-fishing";
const ID = "11111111-1111-4111-8111-111111111111";

function resource(patch: Partial<PublicResource> = {}): PublicResource {
  return {
    id: ID, slug: "vocab-fishing", title: "Vocab Fishing", meta: "เกม", description: "", category: "ภาษาอังกฤษ", gradeLevels: [],
    deliveryMode: "web_app", coverImageUrl: null, tags: [], accessMode: "plans", isFree: false, isNew: false,
    requiredPlanIds: ["teacher"], requiredPlanNames: ["Teacher Pro"], featuredRank: null, reviewAverage: null, reviewCount: 0,
    detail: null, demoUrl: DEMO, ...patch,
  };
}
const guest: PublicResourceViewer = { authenticated: false, role: null, entitlements: EMPTY_ENTITLEMENTS, pendingPlanIds: [] };
const freeMember: PublicResourceViewer = { ...guest, authenticated: true, role: "member" };
const proMember: PublicResourceViewer = { ...freeMember, entitlements: { planId: "teacher", features: {} } };

const view = (item: PublicResource, viewer: PublicResourceViewer) => resourceDemoView(item, viewer, publicResourceAction(item, viewer));

describe("demo button on the detail page", () => {
  it("is shown to everybody when a demo exists: guest, free member, Pro member and admin", () => {
    for (const viewer of [guest, freeMember, proMember, { ...freeMember, role: "admin" as const }]) {
      expect(view(resource(), viewer)).toMatchObject({ href: DEMO, label: DEMO_BUTTON_LABEL });
    }
  });

  it("is shown for free, member-only and not-yet-open resources too", () => {
    for (const accessMode of ["public", "authenticated", "locked"] as const) {
      expect(view(resource({ accessMode, requiredPlanIds: [] }), guest)?.href).toBe(DEMO);
    }
  });

  it("is absent without a demo, and an unsafe stored value never becomes a button", () => {
    expect(view(resource({ demoUrl: null }), guest)).toBeNull();
    for (const demoUrl of ["http://games.kruaorry.com/x", "https://localhost/x", "https://abc.vercel.app/x", "javascript:alert(1)", "/api/resources/x/open", ""]) {
      expect(view(resource({ demoUrl }), guest)).toBeNull();
    }
  });
});

describe("Teacher Pro invitation next to the demo", () => {
  it("offers a plain link to the existing membership flow for a Pro resource the viewer cannot use", () => {
    const shown = view(resource(), guest)!;
    expect(shown.upgrade).not.toBeNull();
    // Same helper as the main upgrade button: /membership with the plan and a safe returnTo.
    expect(shown.upgrade!.href).toBe(publicResourceAction(resource(), guest).href);
    expect(shown.upgrade!.href).toMatch(/^\/membership\?plan=teacher&returnTo=%2Fresources%2Fvocab-fishing$/);
    expect(shown.upgrade!.label).toMatch(/Teacher Pro/);
    // The visitor presses it: the demo link itself is never the membership link and nothing auto-redirects.
    expect(shown.href).toBe(DEMO);
    expect(Object.keys(shown).sort()).toEqual(["href", "label", "upgrade"]);
  });

  it("is also offered to a signed-in free member", () => {
    expect(view(resource(), freeMember)?.upgrade?.href).toMatch(/^\/membership/);
  });

  it("is not shown when the viewer already has the plan, an upgrade is pending, or the resource is not Pro", () => {
    expect(view(resource(), proMember)?.upgrade).toBeNull();
    expect(view(resource(), { ...freeMember, pendingPlanIds: ["teacher"] })?.upgrade).toBeNull();
    expect(view(resource({ accessMode: "public", requiredPlanIds: [] }), guest)?.upgrade).toBeNull();
    expect(view(resource({ accessMode: "authenticated", requiredPlanIds: [] }), guest)?.upgrade).toBeNull();
  });

  it("does not change the full version's own action: still gated for a viewer without the plan", () => {
    const withDemo = publicResourceAction(resource(), freeMember);
    const withoutDemo = publicResourceAction(resource({ demoUrl: null }), freeMember);
    expect(withDemo).toEqual(withoutDemo);
    expect(withDemo.canUse).toBe(false);
    expect(withDemo.href).not.toContain("/open");
    expect(withDemo.href).not.toContain(DEMO);
  });
});
