import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const membersSource = readFileSync(new URL("./AdminMembersPanel.tsx", import.meta.url), "utf8");
const plansSource = readFileSync(new URL("./AdminPlansPanel.tsx", import.meta.url), "utf8");
const mobileNavSource = readFileSync(new URL("./AdminMobileNav.tsx", import.meta.url), "utf8");

describe("responsive admin console contracts", () => {
  it("keeps anonymous and expired identities outside the admin console", () => {
    expect(pageSource).toContain("supabase.auth.getUser().catch(() => null)");
    expect(pageSource).toContain("!authResult.error");
    expect(pageSource).toContain("isPermanentAuthUser(authResult.data.user)");
    expect(pageSource).toContain('router.push("/login")');
  });

  it("uses one permission-aware navigation model on desktop and mobile", () => {
    expect(pageSource).toContain("groups={navGroups}");
    expect(pageSource).toContain('key: "moderation"');
    expect(pageSource).toContain('key: "benefits"');
    expect(pageSource).toContain("isOwner ? [...baseNavItems, OWNER_NAV_ITEM]");
  });

  it("uses authoritative admin-only action counts and marks new work first", () => {
    expect(pageSource).toContain("createCoalescedAdminRefresh");
    expect(pageSource).toContain("loadAdminQueueSnapshot");
    expect(pageSource).toContain("installAdminActionRefresh(window");
    expect(pageSource).toContain("}, allowed)");
    expect(pageSource).toContain("refresh.dispose()");
    expect(pageSource).toContain('requestRows?.filter((row) => row.status === "pending").length');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("status", status)');
    expect(pageSource).toContain("upgradeRows?.filter(isActionableUpgradeRequest).length");
    expect(pageSource).toContain("setQueueRefreshError");
    expect(pageSource).toContain("abortSignal(signal)");
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

  it("writes access, featured order, moderation and benefit copy through the reviewed legacy paths", () => {
    expect(pageSource).toContain('rpc("admin_save_resource"');
    expect(pageSource).toContain('rpc("set_featured_resources"');
    expect(pageSource).toContain('rpc("admin_set_review_visibility"');
    expect(pageSource).toContain('rpc("admin_delete_resource_review"');
    expect(pageSource).toContain('rpc("admin_set_resource_issue_status"');
    expect(pageSource).toContain('.from("requests").update({ status }).eq("id", latest.id)');
    expect(pageSource).toContain('rpc("decline_upgrade_request"');
    expect(pageSource).toContain('rpc("admin_update_feature_copy"');
    expect(pageSource).not.toContain("form.is_free");
    expect(pageSource).toContain("p_access_mode: form.access_mode");
    expect(pageSource).not.toContain('rpc("set_resource_access"');
  });

  it("keeps the reviewed benefit-copy RPC while rendering the package overview in a focused component", () => {
    expect(pageSource).toContain('{ key: "benefits", label: "แพ็กและสิทธิ์"');
    expect(pageSource).toContain("<AdminPlansPanel");
    expect(pageSource).toContain('rpc("admin_update_feature_copy"');
    expect(plansSource).toContain('role="tablist"');
    expect(plansSource).toContain('aria-selected={tab === item}');
    expect(plansSource).toContain('event.key === "ArrowRight"');
    expect(plansSource).toContain("ข้อความนี้ถูกกำหนดในระบบ แก้ในฐานข้อมูลไม่เปลี่ยนหน้าเว็บ");
    expect(plansSource).not.toContain("แก้ราคา");
  });

  it("keeps hidden legacy plans selectable for new premium resources", () => {
    expect(pageSource).toContain("{plans.map((plan) => (");
    expect(pageSource).toContain("แพ็กเดิม/ไม่เปิดขาย");
    expect(pageSource).toContain("name: planDisplayName(plan.id, plan.name)");
    expect(pageSource).toContain("userFacingAdminError(errorMessage)");
    expect(pageSource).toContain(String.raw`/\bTeacher\b(?!\s+Pro\b)/g`);
  });

  it("renders upgrade request plan ids through the shared display-name policy", () => {
    expect(pageSource).toContain("<strong>{planDisplayName(r.plan_id)}</strong>");
    expect(pageSource).not.toContain("<strong>{r.plan_id}</strong>");
  });

  it("preserves the real vote-ranked request workflow and complete tab semantics", () => {
    expect(pageSource).toContain('.order("votes", { ascending: false })');
    expect(pageSource).toContain("const loadTeacherRequests = async (signal: AbortSignal)");
    expect(pageSource).toContain("loadTeacherRequests(signal)");
    expect(pageSource).toContain("{r.votes} โหวต");
    expect(pageSource).toContain('aria-controls="admin-reviews-panel"');
    expect(pageSource).toContain('aria-labelledby="admin-reviews-tab"');
  });

  it("paginates both moderation queues with authoritative database totals", () => {
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).neq("moderation_status", "pending")');
    expect(pageSource).toContain('select("id", { count: "exact", head: true }).eq("status", status)');
    expect(pageSource).toContain("priorityPageSlices(counts, page, MODERATION_PAGE_SIZE)");
    expect(pageSource).toContain("loadReviewPage(reviewPageToLoad, signal)");
    expect(pageSource).toContain("loadReportPage(reportPageToLoad, signal)");
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
    expect(membersSource).toContain('data-label="ครู"');
    expect(pageSource).toContain('data-label="ผู้แก้ไข"');
    expect(pageSource).toContain(".kru-admin-responsive-table td::before");
    expect(pageSource).not.toContain("minWidth: 720");
    expect(pageSource).not.toContain("minWidth: 560");
  });

  it("warns before changing the viewer's own role and refreshes member status time", () => {
    expect(pageSource).toContain("adminId={adminId}");
    expect(pageSource).toContain("referenceNow={memberStatusNow}");
    expect(pageSource).toContain("setMemberStatusNow(Date.now())");
    expect(membersSource).toContain("roleTarget?.id === adminId");
    expect(membersSource).toContain("roleChangeConfirmationCopy(");
    expect(membersSource).toContain("roleTarget.role, nextRole, roleTargetIsSelf");
  });

  it("searches upgrade requests by reference, name, or email and displays payment workflow status", () => {
    expect(pageSource).toContain('const [upgradeSearch, setUpgradeSearch]');
    expect(pageSource).toContain("matchesAdminUpgradeSearch(request, upgradeSearch)");
    expect(pageSource).toContain("filteredUpgradeRequests.map");
    expect(pageSource).toContain("payment_reported_at");
    expect(pageSource).toContain("resolution_reason_code");
    expect(pageSource).toContain("adminMembershipApplicationStatusLabel(r.status, r.resolution_reason_code, r.line_slip_received_at)");
    expect(pageSource).toContain("const loadUpgradeRequests = async (signal: AbortSignal)");
    expect(pageSource).toContain("profiles!upgrade_requests_user_id_fkey(full_name, email)");
    expect(pageSource).toContain("profiles!resource_reviews_user_id_fkey(full_name, email)");
    expect(pageSource).toContain("loadUpgradeRequests(signal)");
    expect(pageSource).toContain(".range(offset, offset + pageSize - 1)");
    expect(pageSource).toContain('.order("id", { ascending: false })');
  });

  it("records LINE receipt separately, gates it on migration 050, and exposes copy-ready success text", () => {
    expect(pageSource).toContain("fetchMembershipLineSlipWorkflowReadiness(supabase)");
    expect(pageSource).toContain('lineSlipWorkflowReadiness !== "ready"');
    expect(pageSource).toContain("includesAdminLineSlipProvenance(lineSlipWorkflowReadinessRef.current)");
    expect(pageSource).toContain("ADMIN_UPGRADE_LINE_SLIP_SELECT");
    expect(pageSource).toContain("ADMIN_UPGRADE_SELECT");
    expect(pageSource).toContain("recordMembershipLineSlipReceived(supabase, latest.id)");
    expect(pageSource).toContain("request.line_slip_received_at");
    expect(pageSource).toContain("r.line_slip_received_at");
    expect(pageSource).toContain("!r.line_slip_received_at");
    expect(pageSource).toContain("บันทึกรับสลิปจาก LINE");
    expect(pageSource).toContain("adminPaymentSuccessMessage");
    expect(pageSource).toContain("navigator.clipboard.writeText(paymentSuccessMessage)");
    expect(pageSource).toContain("คัดลอกข้อความแจ้งสมาชิก");
    const committedSuccess = pageSource.slice(
      pageSource.indexOf("setPaymentSuccessMessage(adminPaymentSuccessMessage"),
      pageSource.indexOf("const handleApproveUpgrade"),
    );
    expect(committedSuccess.indexOf("setPaymentTarget(null)")).toBeLessThan(
      committedSuccess.indexOf("await reloadAdminData()"),
    );
    expect(committedSuccess).toContain("ยืนยันการชำระสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ");
  });

  it("refreshes queue rows and badges together on load, focus, menu open, manual refresh, and actions", () => {
    expect(pageSource).toContain("await refreshAdminQueues(nextReviewPage, nextReportPage)");
    expect(pageSource).toContain('nextView === "requests" || nextView === "moderation" || nextView === "upgrades"');
    expect(pageSource).toContain("void refreshAdminQueues();");
    expect(pageSource).toContain("installAdminActionRefresh(window");
    expect(pageSource).toContain("handleManualAdminRefresh");
    expect(pageSource).toContain("รีเฟรชข้อมูล");
    expect(pageSource).toContain("actionCounts.requests");
    expect(pageSource).toContain("setRequests(sortAdminRequests(snapshot.requests.data ?? []))");
  });

  it("refreshes and compares rendered rows before queue actions and blocks immediate double submits", () => {
    expect(pageSource).toContain("pendingActionRef.current = action");
    expect(pageSource).toContain("refreshAndMatchQueueRow");
    expect(pageSource).toContain('refreshAndMatchQueueRow("requests", request, sameAdminRequestVersion)');
    expect(pageSource).toContain('refreshAndMatchQueueRow("upgrades", request, sameAdminUpgradeVersion)');
    expect(pageSource).toContain('refreshAndMatchQueueRow("reviews", review, sameAdminReviewVersion)');
    expect(pageSource).toContain('refreshAndMatchQueueRow("reports", report, sameAdminReportVersion)');
    expect(pageSource).toContain("sameAdminSubscriptionVersion(paymentTarget.subscription");
    expect(pageSource).toContain("ข้อมูลรายการนี้มีการเปลี่ยนแปลง");
    expect(pageSource).not.toContain("admin_revision");
    expect(pageSource).not.toContain("admin_compare_");
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
    expect(pageSource).toContain('disabled={pendingAction !== null || !paymentVerified || founderConfirmationBlocked || queueRefreshError !== null}');
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

describe("resource slug field in the admin form", () => {
  it("sends p_slug only when the field changed, so other saves still work before migration 055", () => {
    expect(pageSource).toContain("slugParamForSave(form.slug, savedSlug)");
    expect(pageSource).toContain("...(slugParam ? { p_slug: slugParam } : {})");
    expect(pageSource).not.toContain("p_slug: form.slug");
  });

  it("blocks an invalid slug before any upload starts and explains refusals in Thai", () => {
    expect(pageSource).toContain('slugState.kind === "invalid"');
    expect(pageSource.indexOf('slugState.kind === "invalid"')).toBeLessThan(pageSource.indexOf("runCoverUpload(selectedCoverFile)"));
    expect(pageSource).toContain("thaiSlugSaveError(result.saveError) ?? result.saveError");
  });

  it("falls back to the plain selects until the slug column exists and is readable (migrations 053 and 055)", () => {
    expect(pageSource.match(/isSlugUnavailable\(withSlug\.error\)/g)).toHaveLength(2);
    expect(pageSource).toContain("setSlugSupported(false)");
    expect(pageSource).toContain("const slugParam = slugSupported ? slugParamForSave(form.slug, savedSlug) : null;");
    expect(pageSource).toContain("SLUG_UNAVAILABLE_NOTICE");
    expect(pageSource).toContain("RESOURCE_LIST_SELECT");
  });

  it("warns that changing a saved slug breaks the old link", () => {
    expect(pageSource).toContain('state.kind === "changed"');
    expect(pageSource).toContain("ลิงก์เดิม");
  });
});

describe("the database test runs the same column lists as the admin console", () => {
  const script = readFileSync(new URL("../../../scripts/test-admin-save-resource-slug-sql.mjs", import.meta.url), "utf8");
  it("keeps the list and edit selects identical to page.tsx", () => {
    const list = pageSource.match(/const RESOURCE_LIST_SELECT = "([^"]+)";/)?.[1];
    const edit = pageSource.match(/const columns = "(title, meta, description[^"]+)";/)?.[1];
    expect(list).toBeTruthy();
    expect(edit).toBeTruthy();
    expect(script).toContain(`const ADMIN_LIST_COLUMNS = "${list}";`);
    expect(script).toContain(`const ADMIN_EDIT_COLUMNS = "${edit}";`);
  });
});
