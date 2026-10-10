"use client";

import React, { useMemo, useRef, useState } from "react";
import { Check, ListChecks, PackageCheck, X } from "lucide-react";
import { Badge, Button, EmptyState, Input } from "@/components/ui";
import { customerBenefitCopy, hasFixedCustomerBenefitCopy } from "@/lib/benefitCopy";
import type { AdminSubscription } from "@/lib/adminMembership";
import type { AdminPlanResourceSummary } from "@/lib/adminPlanResources";
import type { AdminMemberListItem } from "./memberList";
import {
  benefitValueLabel,
  buildPlanComparisonRows,
  calculatePlanMemberCounts,
  planPriceLabel,
  planSaleStatus,
  previewCustomerBenefitCopy,
  sortPlansForOverview,
  uniqueBenefits,
  type AdminPlanOverviewItem,
  type PlanBenefitRow,
  type PlanMemberCount,
} from "./planOverview";

type PlansTab = "overview" | "comparison" | "copy" | "resources";

interface AdminPlansPanelProps {
  plans: AdminPlanOverviewItem[];
  benefitRows: PlanBenefitRow[];
  members: AdminMemberListItem[];
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>;
  countsAvailable: boolean;
  benefitsAvailable: boolean;
  founderSeatsUsed: number | null;
  referenceNow: number;
  pendingFeatureId: string | null;
  dataMessage: string | null;
  resourceSummary: AdminPlanResourceSummary | null;
  resourceSummaryLoading: boolean;
  resourceSummaryMessage: string | null;
  onOpenContent: () => void;
  onSaveBenefitCopy: (featureId: string, name: string, description: string) => Promise<string | null>;
}

const TAB_ORDER: readonly PlansTab[] = ["overview", "comparison", "copy", "resources"];
const TAB_LABEL: Record<PlansTab, string> = {
  overview: "ภาพรวมแพ็ก",
  comparison: "เปรียบเทียบสิทธิ์",
  copy: "ข้อความที่ลูกค้าเห็น",
  resources: "สื่อกับแพ็ก",
};

function statusTone(status: ReturnType<typeof planSaleStatus>): "success" | "warning" | "neutral" {
  if (status === "เปิดขาย") return "success";
  if (status === "ปิดรับใหม่") return "warning";
  return "neutral";
}

function PlanCard({
  plan,
  benefits,
  count,
  founderSeatsUsed,
  countsAvailable,
  benefitsAvailable,
}: {
  plan: AdminPlanOverviewItem;
  benefits: PlanBenefitRow[];
  count: PlanMemberCount | null;
  founderSeatsUsed: number | null;
  countsAvailable: boolean;
  benefitsAvailable: boolean;
}) {
  const status = planSaleStatus(plan);
  return (
    <article className="kru-card kru-admin-plan-card">
      <div className="kru-admin-plan-card__heading">
        <div>
          <h2>{plan.name}</h2>
          <p>รหัสแพ็ก {plan.id}</p>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>
      <dl className="kru-admin-plan-prices">
        <div><dt>ราคาปีแรก</dt><dd>{planPriceLabel(plan.price_amount_thb)}</dd></div>
        {plan.renewal_price_amount_thb !== null && (
          <div><dt>ราคาต่ออายุ</dt><dd>{planPriceLabel(plan.renewal_price_amount_thb)}</dd></div>
        )}
      </dl>
      {countsAvailable && count ? (
        <div className="kru-admin-plan-counts" aria-label={`จำนวนสมาชิกแพ็ก ${plan.name}`}>
          <span><strong>{count.active}</strong> คนใช้งานอยู่</span>
          <span><strong>{count.expiring}</strong> คนใกล้หมดอายุ</span>
        </div>
      ) : (
        <p className="kru-admin-plan-muted">ยังตรวจสอบจำนวนสมาชิกไม่ได้</p>
      )}
      {plan.id === "founder" && (
        <p className="kru-admin-plan-founder">
          ที่นั่ง Founder: {founderSeatsUsed === null ? "ยังตรวจสอบไม่ได้" : `ใช้ไปแล้ว ${founderSeatsUsed}/100`}
        </p>
      )}
      {plan.lifecycle_status === "legacy" && count && count.active > 0 && (
        <p role="status" className="kru-admin-plan-warning">ยังมี {count.active} คนใช้แพ็กนี้</p>
      )}
      <div>
        <h3>สิทธิ์ในแพ็ก</h3>
        {!benefitsAvailable ? (
          <p className="kru-admin-plan-muted">ยังตรวจสอบสิทธิ์ของแพ็กไม่ได้</p>
        ) : benefits.length ? (
          <div className="kru-admin-plan-benefits">
            {benefits.map((benefit) => {
              const copy = customerBenefitCopy({
                featureId: benefit.feature_id,
                name: benefit.feature_name,
                description: benefit.feature_description,
              });
              return <span key={benefit.feature_id}>{copy.name}{benefit.value_type === "integer" ? ` · ${benefitValueLabel(benefit)}` : ""}</span>;
            })}
          </div>
        ) : <p className="kru-admin-plan-muted">ไม่มีสิทธิ์ที่เปิดใช้งาน</p>}
      </div>
    </article>
  );
}

function EditableBenefitCard({
  feature,
  assignedPlans,
  pending,
  disabled,
  onSave,
}: {
  feature: PlanBenefitRow;
  assignedPlans: string[];
  pending: boolean;
  disabled: boolean;
  onSave: (featureId: string, name: string, description: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(feature.feature_name);
  const [description, setDescription] = useState(feature.feature_description ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const preview = previewCustomerBenefitCopy(feature.feature_id, name, description);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setSaved(false);
    if (preview.filtered && !window.confirm("ข้อความบางส่วนจะถูกกรองก่อนแสดงให้ลูกค้า ต้องการบันทึกต่อหรือไม่?")) return;
    const error = await onSave(feature.feature_id, name, description);
    if (error) setMessage(error);
    else setSaved(true);
  };

  return (
    <form className="kru-card kru-admin-benefit-copy-card" onSubmit={(event) => void handleSubmit(event)}>
      <div className="kru-admin-benefit-copy-card__heading">
        <div>
          <h2>{preview.name}</h2>
          <p>ใช้ร่วมกันในแพ็ก: {assignedPlans.join(", ")}</p>
        </div>
        <Badge tone="success">แก้ข้อความได้</Badge>
      </div>
      <p className="kru-admin-benefit-shared-warning">ข้อความนี้ใช้ร่วมกันทุกแพ็กข้างต้น โปรดอย่าใส่คำสัญญาเกี่ยวกับสิทธิ์หรือความสามารถที่ระบบยังทำไม่ได้จริง</p>
      <Input label="ชื่อสิทธิ์" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} required maxLength={100} />
      <div className="kru-field">
        <label className="kru-field__label" htmlFor={`benefit-description-${feature.feature_id}`}>คำอธิบาย</label>
        <textarea id={`benefit-description-${feature.feature_id}`} className="kru-input kru-admin-textarea" value={description} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} maxLength={500} />
      </div>
      <div className="kru-admin-benefit-preview">
        <span>ตัวอย่างที่ลูกค้าจะเห็น</span>
        <strong>{preview.name}</strong>
        {preview.description && <p>{preview.description}</p>}
      </div>
      {preview.filtered && (
        <p role="alert" className="kru-admin-benefit-filter-warning">ข้อความบางส่วนจะถูกกรองก่อนแสดงบนหน้าเว็บ เช่นคำเชิงเทคนิคหรือคำที่ระบบไม่อนุญาต กรุณาตรวจตัวอย่างก่อนบันทึก</p>
      )}
      {message && <p role="alert" className="kru-admin-benefit-error">{message}</p>}
      {saved && <p role="status" className="kru-admin-benefit-saved">บันทึกข้อความแล้ว</p>}
      <Button type="submit" size="sm" loading={pending} disabled={disabled}>บันทึกข้อความ</Button>
    </form>
  );
}

const RESOURCE_ACCESS_SUMMARY = [
  { key: "free", label: "ใช้ฟรี" },
  { key: "member", label: "สมาชิกฟรี" },
  { key: "pro", label: "Pro (เฉพาะแพ็ก)" },
  { key: "locked", label: "ล็อก" },
] as const;

function PlanResourcesTab({
  summary,
  loading,
  message,
  onOpenContent,
}: {
  summary: AdminPlanResourceSummary | null;
  loading: boolean;
  message: string | null;
  onOpenContent: () => void;
}) {
  if (loading) {
    return <p role="status" className="kru-card kru-admin-plan-resources-message">กำลังโหลดข้อมูลสื่อกับแพ็ก…</p>;
  }
  if (!summary) {
    return <p role={message ? "alert" : "status"} className="kru-card kru-admin-plan-resources-message">{message ?? "ยังโหลดข้อมูลสื่อกับแพ็กไม่ได้ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง"}</p>;
  }

  return (
    <div className="kru-admin-plan-resources">
      <div className="kru-admin-resource-tier-grid">
        {RESOURCE_ACCESS_SUMMARY.map((item) => (
          <article key={item.key} className="kru-card kru-admin-resource-tier-card">
            <span>{item.label}</span>
            <strong>{summary.access_counts[item.key]}</strong>
            <small>รายการที่เผยแพร่แล้ว</small>
          </article>
        ))}
      </div>
      <div
        className="kru-admin-resource-tier-bar"
        role="img"
        aria-label={RESOURCE_ACCESS_SUMMARY.map((item) => `${item.label} ${summary.access_counts[item.key]} รายการ`).join(", ")}
      >
        {RESOURCE_ACCESS_SUMMARY.map((item) => summary.access_counts[item.key] > 0 && (
          <span key={item.key} className={`is-${item.key}`} style={{ flexGrow: summary.access_counts[item.key] }} title={`${item.label}: ${summary.access_counts[item.key]} รายการ`} />
        ))}
      </div>
      <p className="kru-admin-resource-pro-summary">สื่อ Pro ตอนนี้มี <strong>{summary.access_counts.pro}</strong> รายการ</p>

      <div className="kru-card kru-admin-plan-resource-table-wrap" tabIndex={0} aria-label="ตารางสื่อ Pro แยกตามแพ็ก เลื่อนแนวนอนได้">
        <table className="kru-admin-plan-resource-table">
          <thead><tr><th>แพ็ก</th><th>สื่อที่เข้าถึงได้</th><th>สื่อล่าสุด</th></tr></thead>
          <tbody>
            {summary.plans.map((plan) => (
              <tr key={plan.plan_id}>
                <th scope="row">{plan.plan_name}</th>
                <td><strong>{plan.resource_count}</strong> รายการ</td>
                <td>
                  {plan.latest_resources.length ? (
                    <ul>{plan.latest_resources.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul>
                  ) : <span className="kru-admin-plan-muted">ยังไม่มีสื่อ Pro ในแพ็กนี้</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.unassigned_plan_resources.count > 0 && (
        <section role="alert" className="kru-card kru-admin-unassigned-resources">
          <h2>พบสื่อ Pro ที่ยังไม่ได้ผูกแพ็ก {summary.unassigned_plan_resources.count} รายการ</h2>
          <p>สื่อเหล่านี้เผยแพร่แล้วแต่ยังไม่มีลูกค้าแพ็กใดเข้าถึงได้</p>
          <ul>{summary.unassigned_plan_resources.resources.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul>
          <Button type="button" size="sm" variant="secondary" onClick={onOpenContent}>ไปแก้สิทธิ์การเข้าถึงที่หน้าจัดการสื่อ</Button>
        </section>
      )}
    </div>
  );
}

export function AdminPlansPanel({
  plans,
  benefitRows,
  members,
  subscriptionsByUser,
  countsAvailable,
  benefitsAvailable,
  founderSeatsUsed,
  referenceNow,
  pendingFeatureId,
  dataMessage,
  resourceSummary,
  resourceSummaryLoading,
  resourceSummaryMessage,
  onOpenContent,
  onSaveBenefitCopy,
}: AdminPlansPanelProps) {
  const [tab, setTab] = useState<PlansTab>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sortedPlans = useMemo(() => sortPlansForOverview(plans), [plans]);
  const currentPlans = sortedPlans.filter((plan) => plan.lifecycle_status !== "legacy");
  const legacyPlans = sortedPlans.filter((plan) => plan.lifecycle_status === "legacy");
  const counts = useMemo(
    () => countsAvailable ? calculatePlanMemberCounts(sortedPlans, members, subscriptionsByUser, referenceNow) : null,
    [countsAvailable, members, referenceNow, sortedPlans, subscriptionsByUser],
  );
  const comparisonRows = useMemo(() => buildPlanComparisonRows(sortedPlans, benefitRows), [benefitRows, sortedPlans]);
  const features = useMemo(() => uniqueBenefits(benefitRows), [benefitRows]);

  const selectTab = (next: PlansTab, focus = false) => {
    setTab(next);
    if (focus) tabRefs.current[TAB_ORDER.indexOf(next)]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: PlansTab) => {
    const index = TAB_ORDER.indexOf(current);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TAB_ORDER.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TAB_ORDER.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(TAB_ORDER[nextIndex], true);
  };

  return (
    <section className="kru-admin-plans-panel">
      <h1>แพ็กและสิทธิ์</h1>
      <p className="kru-admin-plans-panel__intro">ตรวจภาพรวมแพ็ก เปรียบเทียบสิทธิ์ และจัดการเฉพาะข้อความที่ระบบอนุญาต โดยหน้านี้ไม่เปลี่ยนราคา หรือเปิด–ปิดสิทธิ์</p>
      {dataMessage && <p role="alert" className="kru-admin-plans-panel__notice">{dataMessage}</p>}

      <div className="kru-admin-plans-tabs" role="tablist" aria-label="ส่วนจัดการแพ็กและสิทธิ์">
        {TAB_ORDER.map((item, index) => (
          <button
            key={item}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`admin-plans-${item}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === item}
            aria-controls={`admin-plans-${item}-panel`}
            tabIndex={tab === item ? 0 : -1}
            className={tab === item ? "is-active" : ""}
            onClick={() => selectTab(item)}
            onKeyDown={(event) => handleTabKeyDown(event, item)}
          >
            {TAB_LABEL[item]}
          </button>
        ))}
      </div>

      <div id="admin-plans-overview-panel" role="tabpanel" aria-labelledby="admin-plans-overview-tab" hidden={tab !== "overview"}>
        {plans.length === 0 ? (
          <EmptyState icon={PackageCheck} title="ยังไม่มีข้อมูลแพ็ก" description="กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง" />
        ) : (
          <>
            <div className="kru-admin-plan-grid">
              {currentPlans.map((plan) => <PlanCard key={plan.id} plan={plan} benefits={benefitRows.filter((row) => row.plan_id === plan.id)} count={counts?.[plan.id] ?? null} founderSeatsUsed={founderSeatsUsed} countsAvailable={countsAvailable} benefitsAvailable={benefitsAvailable} />)}
            </div>
            {legacyPlans.length > 0 && (
              <details className="kru-card kru-admin-legacy-plans">
                <summary>แพ็กเดิม ({legacyPlans.length})</summary>
                <p>แพ็กส่วนนี้ปิดรับสมาชิกใหม่ แต่ยังคงแสดงเพื่อตรวจสมาชิกที่มีสิทธิ์เดิม</p>
                <div className="kru-admin-plan-grid">
                  {legacyPlans.map((plan) => <PlanCard key={plan.id} plan={plan} benefits={benefitRows.filter((row) => row.plan_id === plan.id)} count={counts?.[plan.id] ?? null} founderSeatsUsed={founderSeatsUsed} countsAvailable={countsAvailable} benefitsAvailable={benefitsAvailable} />)}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <div id="admin-plans-comparison-panel" role="tabpanel" aria-labelledby="admin-plans-comparison-tab" hidden={tab !== "comparison"}>
        {!benefitsAvailable ? (
          <EmptyState icon={ListChecks} title="ยังโหลดตารางสิทธิ์ไม่ได้" description="ข้อมูลตัวเลขถูกซ่อนไว้เพื่อไม่ให้แสดงค่าไม่จริง" />
        ) : comparisonRows.length === 0 ? (
          <EmptyState icon={ListChecks} title="ยังไม่มีสิทธิ์ที่เปิดใช้งาน" description="ตารางจะแสดงเมื่อมีสิทธิ์ผูกกับแพ็ก" />
        ) : (
          <div className="kru-card kru-admin-plan-comparison-wrap" tabIndex={0} aria-label="ตารางเปรียบเทียบสิทธิ์ เลื่อนแนวนอนได้">
            <table className="kru-admin-plan-comparison">
              <thead><tr><th>สิทธิ์</th>{sortedPlans.map((plan) => <th key={plan.id}>{plan.name}</th>)}</tr></thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.featureId}>
                    <th scope="row"><strong>{row.name}</strong>{row.description && <span>{row.description}</span>}</th>
                    {sortedPlans.map((plan) => {
                      const cell = row.cells[plan.id];
                      return <td key={plan.id}>{cell.included ? <><Check aria-hidden="true" size={18} /><span>{cell.value}</span></> : <><X aria-hidden="true" size={18} /><span>ไม่มี</span></>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div id="admin-plans-copy-panel" role="tabpanel" aria-labelledby="admin-plans-copy-tab" hidden={tab !== "copy"}>
        {!benefitsAvailable ? (
          <EmptyState icon={ListChecks} title="ยังโหลดข้อความสิทธิ์ไม่ได้" description="กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง" />
        ) : features.length === 0 ? (
          <EmptyState icon={ListChecks} title="ยังไม่มีข้อความสิทธิ์" description="ระบบจะแสดงสิทธิ์ที่เปิดใช้งานจริงในแพ็ก" />
        ) : (
          <div className="kru-admin-benefit-copy-list">
            {features.map((feature) => {
              const assignedPlans = benefitRows.filter((row) => row.feature_id === feature.feature_id).map((row) => plans.find((plan) => plan.id === row.plan_id)?.name ?? row.plan_id);
              const customerCopy = customerBenefitCopy({ featureId: feature.feature_id, name: feature.feature_name, description: feature.feature_description });
              if (!hasFixedCustomerBenefitCopy(feature.feature_id)) {
                return <EditableBenefitCard key={feature.feature_id} feature={feature} assignedPlans={assignedPlans} pending={pendingFeatureId === feature.feature_id} disabled={pendingFeatureId !== null} onSave={onSaveBenefitCopy} />;
              }
              return (
                <article key={feature.feature_id} className="kru-card kru-admin-benefit-copy-card">
                  <div className="kru-admin-benefit-copy-card__heading">
                    <div><h2>{customerCopy.name}</h2><p>ใช้ร่วมกันในแพ็ก: {assignedPlans.join(", ")}</p></div>
                    <Badge tone="neutral">อ่านอย่างเดียว</Badge>
                  </div>
                  <p className="kru-admin-benefit-fixed-note">ข้อความนี้ถูกกำหนดในระบบ แก้ในฐานข้อมูลไม่เปลี่ยนหน้าเว็บ</p>
                  <dl className="kru-admin-benefit-copy-comparison">
                    <div><dt>ข้อความที่ลูกค้าเห็นจริง</dt><dd><strong>{customerCopy.name}</strong>{customerCopy.description && <span>{customerCopy.description}</span>}</dd></div>
                    <div><dt>ค่าในฐานข้อมูล</dt><dd><strong>{feature.feature_name}</strong>{feature.feature_description && <span>{feature.feature_description}</span>}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div id="admin-plans-resources-panel" role="tabpanel" aria-labelledby="admin-plans-resources-tab" hidden={tab !== "resources"}>
        <PlanResourcesTab summary={resourceSummary} loading={resourceSummaryLoading} message={resourceSummaryMessage} onOpenContent={onOpenContent} />
      </div>

      <style jsx global>{`
        .kru-admin-plans-panel h1 { font-size: var(--fs-30); }
        .kru-admin-plans-panel__intro { margin: var(--sp-3) 0 var(--sp-5); color: var(--text-muted); }
        .kru-admin-plans-panel__notice { margin: 0 0 var(--sp-5); padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-admin-plans-tabs { display: grid; grid-template-columns: 1fr; gap: var(--sp-2); margin-bottom: var(--sp-6); padding: var(--sp-2); border: 1px solid var(--border-subtle); border-radius: var(--r-lg); background: var(--surface-sunken); }
        .kru-admin-plans-tabs button { min-height: 44px; padding: var(--sp-3) var(--sp-4); border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-muted); font: inherit; font-weight: var(--fw-semibold); cursor: pointer; }
        .kru-admin-plans-tabs button.is-active { background: var(--surface-card); color: var(--purple-800); box-shadow: var(--shadow-sm); }
        .kru-admin-plan-grid { display: grid; gap: var(--sp-5); }
        .kru-admin-plan-card { display: grid; gap: var(--sp-5); padding: var(--sp-5); }
        .kru-admin-plan-card__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
        .kru-admin-plan-card h2, .kru-admin-benefit-copy-card h2 { margin: 0; font-size: var(--fs-20); }
        .kru-admin-plan-card h3 { margin: 0 0 var(--sp-3); font-size: var(--fs-14); }
        .kru-admin-plan-card__heading p, .kru-admin-benefit-copy-card__heading p { margin: var(--sp-1) 0 0; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-admin-plan-prices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); margin: 0; }
        .kru-admin-plan-prices div { padding: var(--sp-3); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-admin-plan-prices dt { color: var(--text-muted); font-size: var(--fs-12); }
        .kru-admin-plan-prices dd { margin: var(--sp-1) 0 0; color: var(--text-strong); font-weight: var(--fw-semibold); }
        .kru-admin-plan-counts { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
        .kru-admin-plan-counts span { padding: var(--sp-2) var(--sp-3); border-radius: var(--r-pill); background: var(--purple-50); color: var(--purple-800); }
        .kru-admin-plan-muted { margin: 0; color: var(--text-muted); }
        .kru-admin-plan-founder, .kru-admin-plan-warning, .kru-admin-benefit-shared-warning, .kru-admin-benefit-fixed-note, .kru-admin-benefit-filter-warning, .kru-admin-benefit-error, .kru-admin-benefit-saved { margin: 0; padding: var(--sp-3); border-radius: var(--r-md); }
        .kru-admin-plan-founder { background: var(--purple-50); color: var(--purple-800); font-weight: var(--fw-semibold); }
        .kru-admin-plan-warning, .kru-admin-benefit-shared-warning, .kru-admin-benefit-filter-warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-admin-benefit-fixed-note { background: var(--surface-sunken); color: var(--text-body); font-weight: var(--fw-semibold); }
        .kru-admin-benefit-error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-admin-benefit-saved { background: var(--status-success-bg); color: var(--status-success-fg); }
        .kru-admin-plan-benefits { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
        .kru-admin-plan-benefits span { padding: 6px 10px; border-radius: var(--r-pill); background: var(--ink-100); color: var(--text-body); font-size: var(--fs-13); }
        .kru-admin-legacy-plans { margin-top: var(--sp-6); padding: var(--sp-5); }
        .kru-admin-legacy-plans > summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: var(--text-strong); font-weight: var(--fw-semibold); }
        .kru-admin-legacy-plans > p { color: var(--text-muted); }
        .kru-admin-plan-comparison-wrap { max-width: 100%; overflow-x: auto; }
        .kru-admin-plan-comparison { width: max-content; min-width: 100%; border-collapse: collapse; }
        .kru-admin-plan-comparison th, .kru-admin-plan-comparison td { min-width: 150px; padding: var(--sp-4); border-bottom: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
        .kru-admin-plan-comparison thead th { background: var(--surface-sunken); color: var(--text-body); }
        .kru-admin-plan-comparison tbody th { position: sticky; left: 0; z-index: 1; min-width: 210px; background: var(--surface-card); }
        .kru-admin-plan-comparison tbody th span { display: block; margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-12); font-weight: var(--fw-regular); }
        .kru-admin-plan-comparison td { color: var(--text-body); }
        .kru-admin-plan-comparison td svg { margin-right: var(--sp-1); vertical-align: middle; color: var(--purple-700); }
        .kru-admin-benefit-copy-list { display: grid; gap: var(--sp-5); }
        .kru-admin-benefit-copy-card { display: grid; gap: var(--sp-4); padding: var(--sp-5); }
        .kru-admin-benefit-copy-card__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
        .kru-admin-benefit-preview { display: grid; gap: var(--sp-1); padding: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-admin-benefit-preview > span, .kru-admin-benefit-copy-comparison dt { color: var(--text-muted); font-size: var(--fs-12); font-weight: var(--fw-semibold); }
        .kru-admin-benefit-preview p { margin: 0; color: var(--text-muted); }
        .kru-admin-benefit-copy-comparison { display: grid; gap: var(--sp-3); margin: 0; }
        .kru-admin-benefit-copy-comparison div { padding: var(--sp-4); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-admin-benefit-copy-comparison dd { display: grid; gap: var(--sp-1); margin: var(--sp-2) 0 0; }
        .kru-admin-benefit-copy-comparison dd span { color: var(--text-muted); }
        .kru-admin-plan-resources { display: grid; gap: var(--sp-5); }
        .kru-admin-plan-resources-message { margin: 0; padding: var(--sp-5); color: var(--text-muted); }
        .kru-admin-resource-tier-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
        .kru-admin-resource-tier-card { display: grid; gap: var(--sp-1); min-width: 0; padding: var(--sp-4); }
        .kru-admin-resource-tier-card span, .kru-admin-resource-tier-card small { color: var(--text-muted); }
        .kru-admin-resource-tier-card strong { color: var(--text-strong); font-size: var(--fs-30); line-height: 1.1; }
        .kru-admin-resource-tier-bar { display: flex; min-height: 16px; overflow: hidden; border-radius: var(--r-pill); background: var(--surface-sunken); }
        .kru-admin-resource-tier-bar span { min-width: 8px; }
        .kru-admin-resource-tier-bar .is-free { background: var(--status-success-fg); }
        .kru-admin-resource-tier-bar .is-member { background: var(--purple-400); }
        .kru-admin-resource-tier-bar .is-pro { background: var(--purple-700); }
        .kru-admin-resource-tier-bar .is-locked { background: var(--ink-500); }
        .kru-admin-resource-pro-summary { margin: 0; color: var(--text-body); }
        .kru-admin-plan-resource-table-wrap { max-width: 100%; overflow-x: auto; }
        .kru-admin-plan-resource-table { width: 100%; min-width: 680px; border-collapse: collapse; }
        .kru-admin-plan-resource-table th, .kru-admin-plan-resource-table td { padding: var(--sp-4); border-bottom: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
        .kru-admin-plan-resource-table thead th { background: var(--surface-sunken); color: var(--text-body); }
        .kru-admin-plan-resource-table tbody th { color: var(--text-strong); }
        .kru-admin-plan-resource-table ul, .kru-admin-unassigned-resources ul { margin: 0; padding-left: var(--sp-5); }
        .kru-admin-unassigned-resources { display: grid; gap: var(--sp-3); padding: var(--sp-5); border-color: var(--status-warning-fg); background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-admin-unassigned-resources h2, .kru-admin-unassigned-resources p { margin: 0; }
        .kru-admin-unassigned-resources h2 { font-size: var(--fs-18); }
        .kru-admin-unassigned-resources .kru-btn { justify-self: start; min-height: 44px; }
        @media (min-width: 700px) {
          .kru-admin-plans-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .kru-admin-plan-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .kru-admin-benefit-copy-comparison { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .kru-admin-resource-tier-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (min-width: 1120px) {
          .kru-admin-plan-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}
