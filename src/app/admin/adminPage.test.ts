import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const mobileNavSource = readFileSync(new URL("./AdminMobileNav.tsx", import.meta.url), "utf8");

describe("responsive admin console contracts", () => {
  it("uses one permission-aware navigation model on desktop and mobile", () => {
    expect(pageSource).toContain("groups={navGroups}");
    expect(pageSource).toContain('key: "moderation"');
    expect(pageSource).toContain('key: "benefits"');
    expect(pageSource).toContain("isOwner ? [...baseNavItems, OWNER_NAV_ITEM]");
  });

  it("uses authoritative admin-only action counts and marks new work first", () => {
    expect(pageSource).toContain("createLatestAdminActionCountRefresh");
    expect(pageSource).toContain("loadAdminActionCounts({");
    expect(pageSource).toContain("installAdminActionRefresh(window");
    expect(pageSource).toContain("}, allowed)");
    expect(pageSource).toContain("countRefresh.dispose()");
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("status", status)');
    expect(pageSource).toContain('.not("payment_reported_at", "is", null)');
    expect(pageSource).toContain("badge: navBadgeByKey[item.key as View]");
    expect(pageSource).toContain('isActionableUpgradeRequest(r) && <Badge tone="brand">ใหม่</Badge>');
    expect(pageSource).toContain('r.status === "pending" && <Badge tone="brand">ใหม่</Badge>');
    expect(pageSource).toContain("sortAdminRequests");
    expect(pageSource).toContain("sortAdminReviews");
    expect(pageSource).toContain("sortAdminReports");
    expect(pageSource).toContain("sortAdminUpgradeRequests");
  });

  it("provides an accessible, keyboard-dismissable mobile drawer", () => {
    expect(mobileNavSource).toContain('role="dialog"');
    expect(mobileNavSource).toContain('aria-modal="true"');
    expect(mobileNavSource).toContain('event.key === "Escape"');
    expect(mobileNavSource).toContain("trigger?.focus()");
    expect(pageSource).toContain("env(safe-area-inset-bottom)");
    expect(pageSource).toContain("100dvh");
    expect(mobileNavSource).toContain('ariaLabel="เมนูหลังบ้าน"');
    expect(pageSource).toContain('ariaLabel="เมนูหลังบ้าน"');
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
    expect(pageSource).toContain("const loadTeacherRequests = async () =>");
    expect(pageSource).toContain("loadTeacherRequests(),");
    expect(pageSource).toContain("{r.votes} โหวต");
    expect(pageSource).toContain('aria-controls="admin-reviews-panel"');
    expect(pageSource).toContain('aria-labelledby="admin-reviews-tab"');
  });

  it("paginates both moderation queues with authoritative database totals", () => {
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).neq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("status", status)');
    expect(pageSource).toContain("priorityPageSlices(counts, page, MODERATION_PAGE_SIZE)");
    expect(pageSource).toContain("loadReviewPage(nextReviewPage)");
    expect(pageSource).toContain("loadReportPage(nextReportPage)");
    expect(pageSource).toContain(".range(slice.from, slice.to)");
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

  it("searches upgrade requests by reference, name, or email and displays payment workflow status", () => {
    expect(pageSource).toContain('const [upgradeSearch, setUpgradeSearch]');
    expect(pageSource).toContain("request.reference_code");
    expect(pageSource).toContain("request.profiles?.full_name");
    expect(pageSource).toContain("request.profiles?.email");
    expect(pageSource).toContain("filteredUpgradeRequests.map");
    expect(pageSource).toContain("payment_reported_at");
    expect(pageSource).toContain("resolution_reason_code");
    expect(pageSource).toContain("adminMembershipApplicationStatusLabel(r.status, r.resolution_reason_code, r.payment_reported_at)");
    expect(pageSource).toContain("const loadUpgradeRequests = async () =>");
    expect(pageSource).toContain("profiles!upgrade_requests_user_id_fkey(full_name, email)");
    expect(pageSource).toContain("profiles!resource_reviews_user_id_fkey(full_name, email)");
    expect(pageSource).toContain("loadUpgradeRequests(),");
    expect(pageSource).toContain(".range(offset, offset + pageSize - 1)");
    expect(pageSource).toContain('.order("id", { ascending: false })');
  });

  it("fails closed for membership operations without blocking unrelated admin data", () => {
    expect(pageSource).toContain("fetchMembershipSchemaReadiness(supabase)");
    expect(pageSource).toContain('if (readiness === "ready")');
    expect(pageSource).toContain('membershipSchemaReadiness === "ready" && membershipDataError === null');
    expect(pageSource).toContain("MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE");
    expect(pageSource).toContain('select("id, name, lifecycle_status, price_amount_thb, is_upgradeable, is_public, sort_order")');
    expect(pageSource).toContain('select("id, name, lifecycle_status, price_amount_thb, renewal_price_amount_thb, is_upgradeable, is_public, sort_order")');
    expect(pageSource.indexOf('if (readiness === "ready")')).toBeLessThan(
      pageSource.indexOf('select("id, name, lifecycle_status, price_amount_thb, renewal_price_amount_thb, is_upgradeable, is_public, sort_order")'),
    );
    expect(pageSource).toContain("if (!membershipMutationsReady)");
    expect(pageSource).toContain("setUpgradeRequests([])");
    expect(pageSource).toContain("setSubscriptions(null)");
    expect(pageSource).toContain("setFounderSeatsUsed(null)");
    expect(pageSource).not.toContain('p_reason: "owner_test_cleanup"');
  });

  it("shows Founder capacity before confirmation and blocks an over-capacity approval", () => {
    expect(pageSource).toContain("Founder ปัจจุบัน");
    expect(pageSource).toContain("หลังยืนยันรายการนี้");
    expect(pageSource).toContain("projectedFounderSeats");
    expect(pageSource).toContain("founderCapacityFull");
    expect(pageSource).toContain("founderConfirmationBlocked");
    expect(pageSource).toContain('disabled={pendingAction !== null || !paymentVerified || founderConfirmationBlocked}');
    expect(pageSource).toContain("await fetchFounderCapacity(supabase)");
    expect(pageSource).toContain("ลองตรวจสอบอีกครั้ง");
  });

  it("keeps the manual payment dialog keyboard-contained and restores the opener", () => {
    expect(pageSource).toContain("ref={paymentDialogRef}");
    expect(pageSource).toContain("tabIndex={-1}");
    expect(pageSource).toContain('event.key === "Escape"');
    expect(pageSource).toContain('event.key !== "Tab"');
    expect(pageSource).toContain('document.body.style.overflow = "hidden"');
    expect(pageSource).toContain("paymentTriggerRef.current.focus()");
    expect(pageSource).toContain("if (pendingActionRef.current) return");
  });
});
