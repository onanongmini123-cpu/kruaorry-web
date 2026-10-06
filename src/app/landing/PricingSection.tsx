import Link from "next/link";
import { Check, Minus } from "lucide-react";
import type { Plan } from "@/lib/data";
import { FOUNDER_LIMIT_NOTICE, FOUNDER_FULL_NOTICE } from "@/lib/founderCapacity";
import { buildPlanComparison, FREE_ACCESS_FEATURE_ID, type ComparisonCell } from "@/lib/planComparison";
import { ACCESS_TIER_LABEL } from "@/lib/resourceAccess";
import { proUpgradeHref } from "@/lib/upgradeFlow";
import { FREE_SIGNUP_HREF } from "@/lib/authReturnPath";
import { formatPlanBenefit } from "@/lib/planBenefitFormat";
import "./pricing.css";

export type PricingCta = "free_signup" | "upgrade" | "founder_offer";

export interface PricingSectionProps {
  plans: readonly Plan[];
  /** False while the plans are still being read; true once they are known. */
  loaded: boolean;
  /** Real state of the Founder offer; null hides the offer (system unavailable). */
  founder: { full: boolean } | null;
  /** True while membership sign-up is paused for maintenance. */
  membershipUnavailable?: boolean;
  /** Where the free plan's button goes: sign-up for visitors, the member app for members. */
  freeAction?: { href: string; label: string };
  onRetry?: () => void;
  onCtaClick?: (cta: PricingCta) => void;
}

const FREE_TAGLINE = "สำหรับคุณครูที่ต้องการทดลองใช้ KruAorry";
const PRO_TAGLINE = "สำหรับคุณครูที่ต้องการใช้สื่อ เกม และเครื่องมืออย่างเต็มรูปแบบ";

/** Price text from configuration; the interval is added only when the label lacks it. */
function priceParts(plan: Plan): { price: string; interval: string | null } {
  const hasInterval = /ปี|เดือน|ครั้งเดียว/.test(plan.priceLabel);
  const interval = hasInterval ? null
    : plan.billingInterval === "year" ? "ต่อปี"
    : plan.billingInterval === "month" ? "ต่อเดือน"
    : null;
  return { price: plan.priceLabel, interval };
}

function highlights(plan: Plan): string[] {
  const hasLimitRow = plan.benefits.some((benefit) => benefit.featureId === "favorites.limit");
  return plan.benefits
    .filter((benefit) => !(hasLimitRow && benefit.featureId === "favorites.enabled"))
    .map((benefit) => formatPlanBenefit(benefit).title);
}

function Cell({ cell, label }: { cell: ComparisonCell; label: string }) {
  if (!cell.included) {
    return (
      <>
        <Minus size={18} aria-hidden="true" className="kru-pricing__no" />
        <span className="kru-pricing__sr">ไม่มี{label}</span>
      </>
    );
  }
  if (cell.text) return <strong>{cell.text}</strong>;
  return (
    <>
      <Check size={18} aria-hidden="true" className="kru-pricing__yes" />
      <span className="kru-pricing__sr">มี{label}</span>
    </>
  );
}

export function PricingSection({ plans, loaded, founder, membershipUnavailable = false, freeAction, onRetry, onCtaClick }: PricingSectionProps) {
  const free = plans.find((plan) => plan.id === "free");
  const pro = plans.find((plan) => plan.id === "teacher");
  const founderPlan = plans.find((plan) => plan.id === "founder");
  const rows = buildPlanComparison(free, pro);
  const signup = freeAction ?? { href: FREE_SIGNUP_HREF, label: "สมัครฟรี" };

  return (
    <section id="pricing" className="kru-pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading">แพ็กเกจ</h2>
      <p className="kru-pricing__lead">เริ่มต้นฟรี แล้วอัปเกรดเป็น Teacher Pro เมื่อพร้อม ไม่ต้องผูกบัตร</p>
      {membershipUnavailable && (
        <p role="status" className="kru-pricing__maintenance">ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว</p>
      )}

      {loaded && !free && !pro ? (
        <div role="status" className="kru-card kru-pricing__empty">
          <p>ขณะนี้ยังแสดงแพ็กเกจไม่ได้ กรุณาลองอีกครั้ง</p>
          {onRetry && <button type="button" className="kru-btn kru-btn--secondary" onClick={onRetry}>ลองใหม่</button>}
        </div>
      ) : (
        <>
          <div className="kru-pricing__grid">
            {free && (
              <article className="kru-card kru-pricing__card" aria-labelledby="pricing-free">
                <h3 id="pricing-free">{free.name}</h3>
                <p className="kru-pricing__tagline">{FREE_TAGLINE}</p>
                <p className="kru-pricing__price"><strong>{priceParts(free).price}</strong></p>
                <ul className="kru-pricing__list">
                  <li><Check size={17} aria-hidden="true" /><span>เกมและสื่อที่ติดป้าย “{ACCESS_TIER_LABEL.free}” และ “{ACCESS_TIER_LABEL.member}”</span></li>
                  {highlights(free).map((text) => (
                    <li key={text}><Check size={17} aria-hidden="true" /><span>{text}</span></li>
                  ))}
                </ul>
                <Link
                  href={signup.href}
                  className="kru-btn kru-btn--secondary kru-btn--block kru-pricing__cta"
                  onClick={() => onCtaClick?.("free_signup")}
                >
                  {signup.label}
                </Link>
              </article>
            )}

            {pro && (
              <article className="kru-card kru-pricing__card kru-pricing__card--pro" aria-labelledby="pricing-pro">
                <div className="kru-pricing__heading">
                  <h3 id="pricing-pro">{pro.name}</h3>
                  <span className="kru-pricing__badge">แนะนำ</span>
                </div>
                <p className="kru-pricing__tagline">{PRO_TAGLINE}</p>
                <p className="kru-pricing__price">
                  <strong>{priceParts(pro).price}</strong>
                  {priceParts(pro).interval && <span>{priceParts(pro).interval}</span>}
                </p>
                {pro.note && <p className="kru-pricing__note">{pro.note}</p>}
                <ul className="kru-pricing__list">
                  <li><Check size={17} aria-hidden="true" /><span>รวมสิทธิ์ของแพ็กฟรีทั้งหมด</span></li>
                  {highlights(pro).map((text) => (
                    <li key={text}><Check size={17} aria-hidden="true" /><span>{text}</span></li>
                  ))}
                </ul>
                <Link
                  href={proUpgradeHref({ planId: "teacher" })}
                  className="kru-btn kru-btn--primary kru-btn--block kru-pricing__cta"
                  onClick={() => onCtaClick?.("upgrade")}
                >
                  อัปเกรดเป็น {pro.name}
                </Link>
              </article>
            )}
          </div>

          {founderPlan && founder && (
            <aside className="kru-pricing__founder" aria-label={`ข้อเสนอเปิดตัว ${founderPlan.name}`}>
              <div>
                <strong>ข้อเสนอเปิดตัว {founderPlan.name}: {founderPlan.priceLabel}</strong>
                <span>{founder.full ? FOUNDER_FULL_NOTICE : FOUNDER_LIMIT_NOTICE}</span>
              </div>
              {!founder.full && (
                <Link
                  href={proUpgradeHref({ planId: "founder" })}
                  className="kru-btn kru-btn--soft kru-btn--sm"
                  onClick={() => onCtaClick?.("founder_offer")}
                >
                  ดูข้อเสนอ
                </Link>
              )}
            </aside>
          )}

          {rows.length > 1 && free && pro && (
            <div className="kru-pricing__compare">
              <table>
                <caption className="kru-pricing__sr">เปรียบเทียบแพ็กฟรีกับ {pro.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">สิทธิ์</th>
                    <th scope="col">{free.name}</th>
                    <th scope="col">{pro.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.featureId} data-feature={row.featureId === FREE_ACCESS_FEATURE_ID ? "access" : row.featureId}>
                      <th scope="row">{row.name}</th>
                      <td><Cell cell={row.free} label={row.name} /></td>
                      <td><Cell cell={row.pro} label={row.name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
