import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const mobileNavSource = readFileSync(new URL("./AdminMobileNav.tsx", import.meta.url), "utf8");

describe("responsive admin console contracts", () => {
  it("uses one permission-aware navigation model on desktop and mobile", () => {
    expect(pageSource).toContain("groups={navGroups}");
    expect(pageSource).toContain('key: "moderation"');
    expect(pageSource).toContain('key: "benefits"');
    expect(pageSource).toContain("isOwner ? [...BASE_NAV_ITEMS, OWNER_NAV_ITEM]");
  });

  it("provides an accessible, keyboard-dismissable mobile drawer", () => {
    expect(mobileNavSource).toContain('role="dialog"');
    expect(mobileNavSource).toContain('aria-modal="true"');
    expect(mobileNavSource).toContain('event.key === "Escape"');
    expect(mobileNavSource).toContain("trigger?.focus()");
    expect(pageSource).toContain("env(safe-area-inset-bottom)");
    expect(pageSource).toContain("100dvh");
  });

  it("writes access, featured order, moderation and benefit copy only through reviewed RPCs", () => {
    expect(pageSource).toContain('rpc("admin_save_resource"');
    expect(pageSource).toContain('rpc("set_featured_resources"');
    expect(pageSource).toContain('rpc("admin_set_review_visibility"');
    expect(pageSource).toContain('rpc("admin_delete_resource_review"');
    expect(pageSource).toContain('rpc("admin_set_resource_issue_status"');
    expect(pageSource).toContain('rpc("admin_update_feature_copy"');
    expect(pageSource).not.toContain("form.is_free");
    expect(pageSource).toContain("p_access_mode: form.access_mode");
    expect(pageSource).not.toContain('rpc("set_resource_access"');
  });

  it("keeps hidden legacy plans selectable for new premium resources", () => {
    expect(pageSource).toContain("{plans.map((plan) => (");
    expect(pageSource).toContain("แพ็กเดิม/ไม่เปิดขาย");
  });

  it("preserves the real vote-ranked request workflow and complete tab semantics", () => {
    expect(pageSource).toContain('.order("votes", { ascending: false })');
    expect(pageSource).toContain("{r.votes} โหวต");
    expect(pageSource).toContain('aria-controls="admin-reviews-panel"');
    expect(pageSource).toContain('aria-labelledby="admin-reviews-tab"');
  });

  it("paginates both moderation queues with authoritative database totals", () => {
    expect(pageSource).toContain('select(ADMIN_REVIEW_SELECT, { count: "exact" })');
    expect(pageSource).toContain('select(ADMIN_REPORT_SELECT, { count: "exact" })');
    expect(pageSource).toContain("nextReviewPage * MODERATION_PAGE_SIZE");
    expect(pageSource).toContain("nextReportPage * MODERATION_PAGE_SIZE");
    expect(pageSource).toContain("รีวิว ({reviewTotal})");
    expect(pageSource).toContain("รายงานปัญหา ({reportTotal})");
    expect(pageSource).toContain("handleReviewPageChange(reviewPage + 1)");
    expect(pageSource).toContain("handleReportPageChange(reportPage + 1)");
    expect(pageSource).toContain("(reviewPage + 1) * MODERATION_PAGE_SIZE >= reviewTotal");
    expect(pageSource).toContain("(reportPage + 1) * MODERATION_PAGE_SIZE >= reportTotal");
    expect(pageSource).toContain("reviews.length === 1 ? Math.max(0, reviewPage - 1) : reviewPage");
    expect(pageSource).toContain('.order("id", { ascending: false })');
    expect(pageSource).not.toContain(".limit(300)");
  });

  it("renders members and audit rows as labelled mobile cards rather than wide-only tables", () => {
    expect(pageSource).toContain('data-label="ครู"');
    expect(pageSource).toContain('data-label="ผู้แก้ไข"');
    expect(pageSource).toContain(".kru-admin-responsive-table td::before");
    expect(pageSource).not.toContain("minWidth: 720");
    expect(pageSource).not.toContain("minWidth: 560");
  });
});
