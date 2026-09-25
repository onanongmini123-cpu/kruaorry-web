import { CheckCircle2, ChevronDown } from "lucide-react";

export type LandingPlanBenefit = {
  featureId: string;
  name: string;
  description: string | null;
  valueType: "boolean" | "integer";
  limitValue: number | null;
};

export type LandingBillingInterval = "month" | "year" | "lifetime" | null;

export type FormattedPlanBenefit = {
  title: string;
  description: string | null;
};

export function formatPlanBenefit(benefit: LandingPlanBenefit): FormattedPlanBenefit {
  const name = benefit.name.trim();
  const description = benefit.description?.trim() || null;
  if (benefit.valueType === "integer") {
    const value = benefit.limitValue === null
      ? "ไม่จำกัด"
      : new Intl.NumberFormat("th-TH").format(benefit.limitValue);
    return { title: `${name}: ${value}`, description };
  }
  return { title: name, description };
}

export function billingIntervalLabel(interval: LandingBillingInterval): string | null {
  if (interval === "month") return "ต่อเดือน";
  if (interval === "year") return "ต่อปี";
  if (interval === "lifetime") return "ชำระครั้งเดียว";
  return null;
}

interface PlanBenefitsProps {
  benefits: readonly LandingPlanBenefit[];
  mobileSummaryCount?: number;
}

function BenefitList({ benefits, compact = false }: { benefits: readonly LandingPlanBenefit[]; compact?: boolean }) {
  return (
    <ul className={`kru-plan-benefits__list ${compact ? "kru-plan-benefits__list--compact" : ""}`}>
      {benefits.map((benefit) => {
        const formatted = formatPlanBenefit(benefit);
        return (
          <li key={benefit.featureId}>
            <CheckCircle2 size={17} aria-hidden="true" />
            <span>
              <strong>{formatted.title}</strong>
              {!compact && formatted.description && <small>{formatted.description}</small>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PlanBenefits({ benefits, mobileSummaryCount = 3 }: PlanBenefitsProps) {
  if (benefits.length === 0) return null;
  const summary = benefits.slice(0, mobileSummaryCount);
  const remainder = benefits.slice(mobileSummaryCount);

  return (
    <section className="kru-plan-benefits" aria-label="สิทธิ์ที่ได้รับ">
      <h3>สิทธิ์ที่ได้รับ</h3>
      <div className="kru-plan-benefits__desktop">
        <BenefitList benefits={benefits} />
      </div>
      <div className="kru-plan-benefits__mobile">
        <BenefitList benefits={summary} compact />
        {remainder.length > 0 && (
          <details>
            <summary>
              ดูสิทธิ์ทั้งหมด
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <BenefitList benefits={remainder} compact />
          </details>
        )}
      </div>

      <style jsx global>{`
        .kru-plan-benefits {
          padding-top: var(--sp-2);
        }

        .kru-plan-benefits h3 {
          margin-bottom: var(--sp-3);
          font-size: var(--fs-15);
          letter-spacing: 0;
        }

        .kru-plan-benefits__list {
          margin: 0;
          padding: 0;
          display: grid;
          gap: var(--sp-3);
          list-style: none;
        }

        .kru-plan-benefits__list li {
          min-width: 0;
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          color: var(--text-body);
        }

        .kru-plan-benefits__list li > svg {
          flex: 0 0 auto;
          margin-top: 2px;
          color: var(--status-success-fg);
        }

        .kru-plan-benefits__list li > span {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .kru-plan-benefits__list strong {
          color: var(--text-strong);
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
          line-height: var(--lh-snug);
        }

        .kru-plan-benefits__list small {
          color: var(--text-muted);
          font-size: var(--fs-12);
          line-height: 1.45;
        }

        .kru-plan-benefits__mobile {
          display: none;
        }

        .kru-plan-benefits details {
          margin-top: var(--sp-3);
          border-top: 1px solid var(--border-subtle);
        }

        .kru-plan-benefits summary {
          min-height: var(--tap-min);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
          color: var(--purple-700);
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
          cursor: pointer;
          list-style: none;
        }

        .kru-plan-benefits summary::-webkit-details-marker {
          display: none;
        }

        .kru-plan-benefits details[open] summary svg {
          transform: rotate(180deg);
        }

        .kru-plan-benefits details .kru-plan-benefits__list {
          padding-bottom: var(--sp-2);
        }

        @media (max-width: 640px) {
          .kru-plan-benefits__desktop {
            display: none;
          }

          .kru-plan-benefits__mobile {
            display: block;
          }

          .kru-plan-benefits__list--compact {
            gap: var(--sp-2);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kru-plan-benefits summary svg {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
