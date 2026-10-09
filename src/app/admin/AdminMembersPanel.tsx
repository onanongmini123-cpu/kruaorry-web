"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { Badge, Button, EmptyState, SearchField, Select } from "@/components/ui";
import {
  canOfferAdminPlan,
  canRenewMember,
  effectiveMemberPlan,
  renewalAmountThb,
  type AdminPlan,
  type AdminSubscription,
} from "@/lib/adminMembership";
import {
  MEMBER_FILTER_LABEL,
  MEMBER_FILTER_ORDER,
  MEMBER_SORT_OPTIONS,
  filterAndSortMembers,
  isActivePremiumSubscription,
  isExpiringWithinThirtyDays,
  memberFilterCounts,
  roleChangeConfirmationCopy,
  type AdminMemberListItem,
  type AdminMemberRole,
  type MemberFilter,
  type MemberSort,
} from "./memberList";

interface AdminMembersPanelProps {
  members: AdminMemberListItem[];
  subscriptions: AdminSubscription[] | null;
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>;
  plans: AdminPlan[];
  premiumPlanIds: ReadonlySet<string> | null;
  founderSeatsUsed: number | null;
  membershipDataError: string | null;
  membershipMutationsReady: boolean;
  mutationBusy: boolean;
  isOwner: boolean;
  adminId: string | null;
  referenceNow: number;
  onMemberPlanChange: (
    id: string,
    currentPlan: string,
    nextPlan: string,
    subscription: AdminSubscription | null,
  ) => void;
  onRenewSubscription: (subscription: AdminSubscription) => void;
  onRoleChange: (member: AdminMemberListItem, role: AdminMemberRole) => Promise<string | null>;
}

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const ROLE_LABEL: Record<AdminMemberRole, string> = {
  member: "สมาชิก",
  admin: "แอดมิน",
  owner: "เจ้าของระบบ",
};

function safeDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? dateFormat.format(timestamp) : "ไม่ทราบวันที่";
}

function nextSuggestedRole(role: AdminMemberRole): AdminMemberRole {
  if (role === "member") return "admin";
  if (role === "admin") return "member";
  return "admin";
}

function roleChangeWarning(role: AdminMemberRole): string {
  if (role === "owner") return "เจ้าของระบบมีสิทธิ์สูงสุด รวมถึงเปลี่ยนบทบาททีมงานและดูประวัติการแก้ไข";
  if (role === "admin") return "แอดมินจะเห็นข้อมูลสมาชิกทั้งหมดและจัดการระบบได้";
  return "บัญชีนี้จะออกจากหลังบ้านและกลับไปใช้สิทธิ์สมาชิกทั่วไป";
}

export function AdminMembersPanel({
  members,
  subscriptions,
  subscriptionsByUser,
  plans,
  premiumPlanIds,
  founderSeatsUsed,
  membershipDataError,
  membershipMutationsReady,
  mutationBusy,
  isOwner,
  adminId,
  referenceNow,
  onMemberPlanChange,
  onRenewSubscription,
  onRoleChange,
}: AdminMembersPanelProps) {
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemberSort>("newest");
  const [roleTarget, setRoleTarget] = useState<AdminMemberListItem | null>(null);
  const [nextRole, setNextRole] = useState<AdminMemberRole>("member");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const rolePendingRef = useRef(false);
  const roleDialogRef = useRef<HTMLElement>(null);
  const roleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const premiumIds = useMemo(() => premiumPlanIds ?? new Set<string>(), [premiumPlanIds]);
  const now = referenceNow;
  const activeFilter: MemberFilter = premiumPlanIds || filter === "all" || filter === "staff" ? filter : "all";

  useEffect(() => {
    if (!roleTarget) return;
    const dialog = roleDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialog?.focus());

    const close = () => {
      if (rolePendingRef.current) return;
      setRoleTarget(null);
      setRoleError(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (roleTriggerRef.current?.isConnected) roleTriggerRef.current.focus();
    };
  }, [roleTarget]);

  const counts = useMemo(
    () => memberFilterCounts(members, subscriptionsByUser, premiumIds, now),
    [members, now, premiumIds, subscriptionsByUser],
  );
  const visibleMembers = useMemo(
    () => filterAndSortMembers(members, subscriptionsByUser, premiumIds, { filter: activeFilter, query, sort, now }),
    [activeFilter, members, now, premiumIds, query, sort, subscriptionsByUser],
  );
  const selectedTotal = counts[activeFilter];
  const roleTargetIsSelf = roleTarget?.id === adminId;
  const roleConfirmationCopy = roleTarget
    ? roleChangeConfirmationCopy(roleTarget.role, nextRole, roleTargetIsSelf)
    : null;

  const clearFilters = () => {
    setFilter("all");
    setQuery("");
    setSort("newest");
  };

  const openRoleDialog = (member: AdminMemberListItem, trigger: HTMLButtonElement) => {
    roleTriggerRef.current = trigger;
    setRoleTarget(member);
    setNextRole(nextSuggestedRole(member.role));
    setRoleError(null);
  };

  const closeRoleDialog = () => {
    if (rolePendingRef.current) return;
    setRoleTarget(null);
    setRoleError(null);
  };

  const confirmRoleChange = async () => {
    if (!roleTarget || nextRole === roleTarget.role || rolePending || mutationBusy) return;
    rolePendingRef.current = true;
    setRolePending(true);
    setRoleError(null);
    let error: string | null = null;
    try {
      error = await onRoleChange(roleTarget, nextRole);
    } finally {
      rolePendingRef.current = false;
      setRolePending(false);
    }
    if (error) {
      setRoleError(error);
      return;
    }
    setRoleTarget(null);
  };

  return (
    <div className="kru-admin-members-panel">
      <h1>สมาชิก</h1>
      <p className="kru-admin-members-panel__intro">รายชื่อผู้ใช้ที่สมัครจริง · แพ็กที่แสดงคำนวณจากสิทธิ์ที่ยังมีผล ไม่ใช่ค่าแคชในโปรไฟล์</p>
      <p className="kru-admin-members-panel__founder">
        ยืนยันชำระ Founder แล้ว: {founderSeatsUsed === null ? "ยังตรวจสอบไม่ได้" : founderSeatsUsed + "/100"}
      </p>
      {membershipDataError && <p role="alert" className="kru-admin-members-panel__error">{membershipDataError}</p>}
      {!premiumPlanIds && (
        <p role="status" className="kru-admin-members-panel__notice">ยังตรวจสิทธิ์ Pro ไม่สำเร็จ จึงปิดตัวกรอง Pro/ใกล้หมดอายุ/ฟรีชั่วคราว</p>
      )}

      <div className="kru-admin-member-filters" role="group" aria-label="กรองรายชื่อสมาชิก">
        {MEMBER_FILTER_ORDER.map((item) => {
          const needsPremiumData = item === "premium" || item === "expiring" || item === "free";
          return (
            <button
              key={item}
              type="button"
              className={activeFilter === item ? "is-active" : ""}
              aria-pressed={activeFilter === item}
              disabled={needsPremiumData && !premiumPlanIds}
              onClick={() => setFilter(item)}
            >
              <span>{MEMBER_FILTER_LABEL[item]}</span>
              <strong>{counts[item]}</strong>
            </button>
          );
        })}
      </div>

      <div className="kru-admin-member-tools">
        <SearchField
          value={query}
          onChange={setQuery}
          ariaLabel="ค้นหาชื่อหรืออีเมลสมาชิก"
          placeholder="ค้นหาชื่อหรืออีเมล"
        />
        <Select
          label="เรียงตาม"
          value={sort}
          options={[...MEMBER_SORT_OPTIONS]}
          onChange={(value) => setSort(value as MemberSort)}
        />
      </div>

      <p className="kru-admin-member-count" role="status">แสดง {visibleMembers.length} จาก {selectedTotal} คน</p>

      {members.length === 0 ? (
        <EmptyState icon={Users} title="ยังไม่มีสมาชิก" description="รายชื่อจะแสดงเมื่อมีผู้สมัครใช้งาน" />
      ) : visibleMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="ไม่พบสมาชิกที่ตรงกับเงื่อนไข"
          description="ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
          action={<Button type="button" variant="soft" onClick={clearFilters}>ล้างตัวกรอง</Button>}
        />
      ) : (
        <div className="kru-card kru-admin-responsive-table-wrap">
          <table className="kru-admin-responsive-table kru-admin-member-table">
            <thead>
              <tr>
                {["ครู", "แพ็กและสถานะ", "สมัครเมื่อ", "บทบาท", "การต่ออายุ"].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => {
                const subscription = subscriptionsByUser.get(member.id) ?? null;
                const effectivePlan = subscriptions === null ? member.plan : effectiveMemberPlan(subscription, now);
                const premium = isActivePremiumSubscription(subscription, premiumIds, now);
                const expiring = isExpiringWithinThirtyDays(subscription, premiumIds, now);
                const plan = plans.find((item) => item.id === effectivePlan);
                const renewablePlan = plans.find((item) => item.id === subscription?.plan_id && item.lifecycle_status === "active");
                const renewalPrice = subscription && renewablePlan
                  ? renewalAmountThb(subscription, renewablePlan.renewal_price_amount_thb ?? renewablePlan.price_amount_thb)
                  : null;
                const canRenew = subscriptions !== null && canRenewMember(subscription, now) && renewalPrice !== null;
                const ended = Boolean(subscription && (
                  ["expired", "cancelled", "revoked"].includes(subscription.status)
                  || (subscription.current_period_end && Date.parse(subscription.current_period_end) <= now)
                ));
                const planLabel = effectivePlan === "free" ? "ฟรี" : plan?.name ?? effectivePlan;
                const statusText = premium
                  ? subscription?.current_period_end
                    ? (expiring ? "ใกล้หมดอายุ · " : "") + "ใช้งานถึง " + safeDate(subscription.current_period_end)
                    : "ใช้งานอยู่"
                  : ended
                    ? "หมดอายุแล้ว"
                    : "บัญชีฟรี";
                return (
                  <tr key={member.id}>
                    <td data-label="ครู">
                      <div className="kru-admin-member-name">{member.full_name || "(ยังไม่ระบุชื่อ)"}</div>
                      <div className="kru-admin-member-email">{member.email}</div>
                    </td>
                    <td data-label="แพ็กและสถานะ">
                      <div className="kru-admin-member-plan">
                        <Badge tone={effectivePlan === "free" ? "neutral" : "brand"}>{planLabel}</Badge>
                        <span className={expiring ? "is-warning" : ended ? "is-danger" : ""}>{statusText}</span>
                      </div>
                      <select
                        className="kru-select kru-admin-member-plan-select"
                        aria-label={"เปลี่ยนแพ็กของ " + (member.full_name || member.email)}
                        value={effectivePlan}
                        disabled={subscriptions === null || mutationBusy}
                        onChange={(event) => {
                          const changedPlan = event.currentTarget.value;
                          event.currentTarget.value = effectivePlan;
                          onMemberPlanChange(member.id, effectivePlan, changedPlan, subscription);
                        }}
                      >
                        {plans.filter((item) => canOfferAdminPlan(item, effectivePlan)).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}{item.lifecycle_status === "legacy" ? " — เดิม" : ""}</option>
                        ))}
                      </select>
                      {subscriptions === null && <small>แสดงค่าเดิม ยังไม่ยืนยันสิทธิ์</small>}
                    </td>
                    <td data-label="สมัครเมื่อ">{safeDate(member.created_at)}</td>
                    <td data-label="บทบาท">
                      <div className="kru-admin-member-role">
                        <Badge tone={member.role === "member" ? "neutral" : "success"}>{ROLE_LABEL[member.role]}</Badge>
                        {isOwner && (
                          <Button
                            type="button"
                            size="sm"
                            variant="soft"
                            icon={ShieldCheck}
                            disabled={mutationBusy}
                            onClick={(event) => openRoleDialog(member, event.currentTarget)}
                          >
                            เปลี่ยนบทบาท
                          </Button>
                        )}
                      </div>
                    </td>
                    <td data-label="การต่ออายุ">
                      {canRenew && subscription ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!membershipMutationsReady || mutationBusy}
                          onClick={() => onRenewSubscription(subscription)}
                        >
                          ยืนยันชำระเพื่อต่ออายุ
                        </Button>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {roleTarget && (
        <div className="kru-admin-dialog-layer">
          <button type="button" className="kru-admin-dialog-scrim" aria-label="ปิดหน้าต่างเปลี่ยนบทบาท" onClick={closeRoleDialog} disabled={rolePending} />
          <section
            ref={roleDialogRef}
            tabIndex={-1}
            className="kru-card kru-admin-payment-dialog kru-admin-role-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-confirmation-title"
            aria-describedby="role-confirmation-description"
          >
            <div>
              <span className="kru-admin-dialog-eyebrow">ตรวจสอบสิทธิ์ให้ชัดเจน</span>
              <h2 id="role-confirmation-title">ยืนยันการเปลี่ยนบทบาท</h2>
              <p id="role-confirmation-description">การเปลี่ยนบทบาทมีผลกับสิทธิ์หลังบ้านทันที และระบบจะบันทึกไว้ในประวัติการแก้ไข</p>
            </div>
            <dl className="kru-admin-payment-dialog__summary">
              <div><dt>บัญชี</dt><dd><strong>{roleTarget.full_name || "(ยังไม่ระบุชื่อ)"}</strong><br /><span>{roleTarget.email}</span></dd></div>
              <div><dt>บทบาทเดิม</dt><dd>{ROLE_LABEL[roleTarget.role]}</dd></div>
            </dl>
            <Select
              label="บทบาทใหม่"
              value={nextRole}
              disabled={rolePending}
              options={[
                { value: "member", label: "สมาชิก" },
                { value: "admin", label: "แอดมิน" },
                { value: "owner", label: "เจ้าของระบบ" },
              ]}
              onChange={(value) => {
                setNextRole(value as AdminMemberRole);
                setRoleError(null);
              }}
            />
            <p className="kru-admin-role-dialog__warning">{roleChangeWarning(nextRole)}</p>
            {roleConfirmationCopy?.selfWarnings.map((warning) => (
              <p key={warning} role="alert" className="kru-admin-role-dialog__self-warning">{warning}</p>
            ))}
            {roleTarget.role === "owner" && nextRole !== "owner" && (
              <p className="kru-admin-role-dialog__warning">ระบบจะปฏิเสธรายการหากบัญชีนี้เป็นเจ้าของระบบคนสุดท้าย</p>
            )}
            {roleError && <p id="role-change-error" role="alert" className="kru-admin-payment-error">{roleError}</p>}
            <div className="kru-admin-dialog-actions">
              <Button type="button" variant="ghost" onClick={closeRoleDialog} disabled={rolePending}>ยกเลิก</Button>
              <Button
                type="button"
                loading={rolePending}
                disabled={rolePending || mutationBusy || nextRole === roleTarget.role}
                onClick={() => void confirmRoleChange()}
                aria-describedby={roleError ? "role-change-error" : undefined}
              >
                {roleConfirmationCopy?.confirmLabel ?? `ยืนยันเปลี่ยนเป็น${ROLE_LABEL[nextRole]}`}
              </Button>
            </div>
          </section>
        </div>
      )}
      <style jsx global>{`
        .kru-admin-members-panel h1 { font-size: var(--fs-30); }
        .kru-admin-members-panel__intro { margin: var(--sp-3) 0; color: var(--text-muted); }
        .kru-admin-members-panel__founder { margin: 0 0 var(--sp-5); color: var(--text-muted); }
        .kru-admin-members-panel__error, .kru-admin-members-panel__notice { margin: 0 0 var(--sp-5); padding: var(--sp-4); border-radius: var(--r-md); }
        .kru-admin-members-panel__error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-admin-members-panel__notice { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-admin-member-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-5); }
        .kru-admin-member-filters button { min-height: 56px; padding: var(--sp-3) var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-card); color: var(--text-body); cursor: pointer; text-align: left; }
        .kru-admin-member-filters button strong { min-width: 28px; padding: 2px 8px; border-radius: var(--r-pill); background: var(--ink-100); color: var(--text-strong); text-align: center; }
        .kru-admin-member-filters button.is-active { border-color: var(--border-brand); background: var(--purple-50); color: var(--purple-800); box-shadow: var(--shadow-sm); }
        .kru-admin-member-filters button:disabled { cursor: not-allowed; opacity: .55; }
        .kru-admin-member-tools { display: grid; gap: var(--sp-4); margin-bottom: var(--sp-3); }
        .kru-admin-member-count { margin: 0 0 var(--sp-4); color: var(--text-muted); font-size: var(--fs-14); }
        .kru-admin-member-table th { padding: var(--sp-4) var(--sp-5); background: var(--surface-sunken); color: var(--text-body); font-size: var(--fs-13); text-align: left; }
        .kru-admin-member-table td { padding: var(--sp-4) var(--sp-5); }
        .kru-admin-member-name { font-weight: var(--fw-medium); color: var(--text-strong); }
        .kru-admin-member-email { margin-top: 3px; color: var(--text-muted); font-size: var(--fs-13); overflow-wrap: anywhere; }
        .kru-admin-member-plan, .kru-admin-member-role { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
        .kru-admin-member-plan > span:last-child { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-admin-member-plan > span.is-warning { color: var(--status-warning-fg); font-weight: var(--fw-semibold); }
        .kru-admin-member-plan > span.is-danger { color: var(--status-danger-fg); }
        .kru-admin-member-plan-select { width: 100%; max-width: 240px; min-height: 44px; margin-top: var(--sp-2); }
        .kru-admin-member-table small { display: block; margin-top: var(--sp-2); color: var(--text-muted); }
        .kru-admin-member-role { align-items: flex-start; }
        .kru-admin-role-dialog { display: grid; gap: var(--sp-5); }
        .kru-admin-role-dialog__warning { margin: 0 !important; padding: var(--sp-3); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg) !important; }
        .kru-admin-role-dialog__self-warning { margin: 0 !important; padding: var(--sp-4); border: 2px solid var(--status-danger-fg); border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg) !important; font-weight: var(--fw-semibold); }
        @media (min-width: 700px) {
          .kru-admin-member-filters { grid-template-columns: repeat(5, minmax(0, 1fr)); }
          .kru-admin-member-tools { grid-template-columns: minmax(260px, 1fr) minmax(220px, .35fr); align-items: end; }
        }
        @media (max-width: 699px) {
          .kru-admin-member-table td { align-items: start; }
          .kru-admin-member-plan, .kru-admin-member-role { align-items: flex-start; }
          .kru-admin-member-role .kru-btn, .kru-admin-member-table td[data-label="การต่ออายุ"] .kru-btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
