"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen, Gamepad2, Heart, LayoutDashboard, UserRound, Crown } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Mascot } from "@/components/Mascot";
import { ResourceCard } from "@/components/ui";
import type { Resource } from "@/lib/data";
import { formatThaiDay, greetingText, isNewSince, readRecentIds } from "@/lib/myHome";
import { resourceDiscoveryHref } from "@/lib/resourceDiscovery";
import { accessTier } from "@/lib/resourceAccess";
import { resourceHref } from "@/lib/resourceUrl";
import type { ViewerSummary } from "./useViewerSummary";

const FAVORITES_SHOWN = 12;

const QUICK_ACTIONS = [
  { icon: FolderOpen, label: "คลังสื่อทั้งหมด", href: "/resources" },
  { icon: Gamepad2, label: "เกม", href: resourceDiscoveryHref("/resources", { query: "เกม" }) },
  { icon: Heart, label: "รายการโปรด", href: "/app?view=favorites" },
  { icon: UserRound, label: "บัญชีของฉัน", href: "/app?view=account" },
] as const;

function Row({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="kru-my__row" aria-labelledby={id}>
      <div className="kru-my__row-head">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CardRow({ labelledBy, items, baseline }: { labelledBy: string; items: Resource[]; baseline: number | null }) {
  return (
    <ul className="kru-my__scroller" aria-labelledby={labelledBy} tabIndex={0}>
      {items.map((resource) => (
        <li key={resource.id}>
          <ResourceCard
            title={resource.title}
            description={resource.description}
            meta={resource.meta}
            category={resource.category}
            deliveryMode={resource.affordance}
            gradeLevels={resource.gradeLevels}
            requiredPlanNames={resource.requiredPlanNames}
            accessTier={accessTier(resource.accessMode)}
            coverImageUrl={resource.coverImageUrl}
            isNew={isNewSince(resource.publishedAt, baseline, resource.isNew)}
            trialAvailable={resource.trialAvailable}
            href={resourceHref(resource)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Shown while the member's own facts load, so the page does not jump. */
export function MyHomeSkeleton() {
  return (
    <section className="kru-my" aria-busy="true" aria-label="ส่วนของฉัน">
      <p className="kru-my__sr" role="status">กำลังเตรียมส่วนของคุณครู</p>
      <div className="kru-my__welcome kru-my__skeleton" style={{ minHeight: 132 }} />
      <div className="kru-my__quick">
        {[0, 1, 2, 3].map((n) => <span key={n} className="kru-my__skeleton" style={{ minHeight: 84, borderRadius: "var(--r-lg)" }} />)}
      </div>
      <MyHomeStyles />
    </section>
  );
}

export function MyHome({ summary, resources, baseline }: { summary: ViewerSummary; resources: Resource[]; baseline: number | null }) {
  const userId = summary.userId;
  const byId = useMemo(() => new Map(resources.map((resource) => [resource.id.toLowerCase(), resource])), [resources]);

  // Read once per mount: this browser's own recently opened resources for this member.
  const recent = useMemo(
    () => (userId ? readRecentIds(userId).map((id) => byId.get(id)).filter((item): item is Resource => item !== undefined) : []),
    [userId, byId],
  );
  const favorites = useMemo(
    () => summary.savedIds.map((id) => byId.get(id.toLowerCase())).filter((item): item is Resource => item !== undefined).slice(0, FAVORITES_SHOWN),
    [summary.savedIds, byId],
  );
  const until = formatThaiDay(summary.until);
  const showCatalogRows = resources.length > 0;

  return (
    <section className="kru-my" aria-label="ส่วนของฉัน">
      <div className="kru-my__welcome">
        <Mascot size={52} />
        <div className="kru-my__welcome-text">
          <h2>{greetingText(summary.fullName)}</h2>
          {summary.label && (
            <p className="kru-my__status">
              <span className={`kru-my__badge kru-my__badge--${summary.kind ?? "free"}`}>{summary.kind === "pro" && <Crown size={14} aria-hidden="true" />}{summary.label}</span>
              {summary.kind === "pro" && until && <span>ใช้ได้ถึง {until}</span>}
              {summary.kind === "free" && <span>เลือกใช้สื่อฟรีได้เลยค่ะ</span>}
            </p>
          )}
        </div>
        <div className="kru-my__welcome-action">
          {summary.kind === "free" && <Link href="/membership" className="kru-btn kru-btn--secondary">อัปเกรดเป็น Teacher Pro</Link>}
          {summary.kind === "admin" && <Link href="/admin" className="kru-btn kru-btn--secondary"><LayoutDashboard size={16} aria-hidden="true" /> หลังบ้าน</Link>}
        </div>
      </div>

      <nav className="kru-my__quick" aria-label="ทางลัดของฉัน">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.label} href={action.href} className="kru-my__quick-item">
            <span className="kru-my__quick-icon"><action.icon size={22} aria-hidden="true" /></span>
            <span>{action.label}</span>
          </Link>
        ))}
      </nav>

      {showCatalogRows && recent.length > 0 && (
        <Row id="my-recent" title="🕘 ใช้ล่าสุด">
          <CardRow labelledBy="my-recent" items={recent} baseline={baseline} />
        </Row>
      )}

      {showCatalogRows && (
        <Row
          id="my-favorites"
          title="❤️ รายการโปรดของฉัน"
          action={favorites.length > 0 ? <Link href="/app?view=favorites" className="kru-my__more">ดูทั้งหมด <ArrowRight size={15} aria-hidden="true" /></Link> : undefined}
        >
          {favorites.length > 0 ? (
            <CardRow labelledBy="my-favorites" items={favorites} baseline={baseline} />
          ) : (
            <p className="kru-my__empty">
              กด ❤️ ที่สื่อที่ชอบ แล้วจะมาอยู่ตรงนี้ค่ะ <Link href="/app?view=library">ไปเลือกสื่อ <ArrowRight size={14} aria-hidden="true" /></Link>
            </p>
          )}
        </Row>
      )}
      <MyHomeStyles />
    </section>
  );
}

function MyHomeStyles() {
  return (
    <style>{`
      .kru-my { width: min(100%, var(--container-max)); margin: 0 auto; padding: var(--sp-5) var(--sp-5) 0; display: grid; gap: var(--sp-5); }
      .kru-my__welcome { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-5); border: 1px solid var(--border-brand, #e0d5fb); border-radius: var(--r-lg); background: linear-gradient(135deg, var(--purple-50), var(--pink-50) 70%, var(--white)); box-shadow: var(--shadow-xs); flex-wrap: wrap; }
      .kru-my__welcome-text { flex: 1 1 220px; min-width: 0; }
      .kru-my__welcome h2 { margin: 0; font-size: clamp(1.25rem, 4.4vw, 1.625rem); line-height: 1.3; }
      .kru-my__status { margin: var(--sp-2) 0 0; display: flex; align-items: center; gap: var(--sp-2) var(--sp-3); flex-wrap: wrap; color: var(--text-muted); font-size: var(--fs-14); }
      .kru-my__badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 12px; border-radius: var(--r-pill); font-weight: var(--fw-semibold); font-size: var(--fs-13); background: var(--white); border: 1px solid var(--border-subtle); color: var(--text-strong); }
      .kru-my__badge--pro { background: var(--amber-50, #fff6dd); border-color: #f1d98a; color: var(--amber-700, #8a5a00); }
      .kru-my__badge--admin { background: var(--purple-100); border-color: var(--purple-200); color: var(--purple-700); }
      .kru-my__welcome-action { flex: 0 0 auto; }
      .kru-my__welcome-action .kru-btn { min-height: var(--tap-min, 44px); }
      .kru-my__quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-3); }
      .kru-my__quick-item { display: grid; justify-items: center; align-content: center; gap: 6px; min-height: 84px; padding: var(--sp-3) var(--sp-2); border: 1px solid var(--border-subtle); border-radius: var(--r-lg); background: var(--white); color: var(--text-strong); font-size: var(--fs-13); font-weight: var(--fw-semibold); text-align: center; text-decoration: none; transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
      .kru-my__quick-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); color: var(--text-strong); text-decoration: none; }
      .kru-my__quick-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--r-pill); background: var(--purple-50); color: var(--purple-700); }
      .kru-my__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      .kru-my__row { min-width: 0; }
      .kru-my__row-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
      .kru-my__row-head h2 { margin: 0; font-size: var(--fs-20); }
      .kru-my__more { display: inline-flex; align-items: center; gap: 4px; min-height: var(--tap-min, 44px); font-size: var(--fs-14); font-weight: var(--fw-semibold); }
      .kru-my__scroller { margin: 0; padding: 0 0 var(--sp-3); list-style: none; display: flex; gap: var(--sp-4); overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }
      .kru-my__scroller:focus-visible { outline: 3px solid var(--purple-700, #7256a8); outline-offset: 2px; }
      .kru-my__scroller > li { flex: 0 0 min(240px, 70vw); min-width: 0; scroll-snap-align: start; }
      .kru-my__empty { margin: 0; padding: var(--sp-4) var(--sp-5); border: 1px dashed var(--border-default); border-radius: var(--r-lg); background: var(--surface-card, #fff); color: var(--text-muted); }
      .kru-my__empty a { display: inline-flex; align-items: center; gap: 4px; min-height: var(--tap-min, 44px); font-weight: var(--fw-semibold); }
      .kru-my__skeleton { display: block; border-radius: var(--r-lg); background: linear-gradient(100deg, var(--purple-50) 20%, var(--purple-100) 50%, var(--purple-50) 80%); background-size: 220% 100%; animation: kru-my-pulse 1.4s ease-in-out infinite; }
      @keyframes kru-my-pulse { from { background-position: 100% 0; } to { background-position: -100% 0; } }
      @media (max-width: 560px) {
        .kru-my { padding-inline: var(--sp-4); gap: var(--sp-4); }
        .kru-my__welcome { padding: var(--sp-4); }
        .kru-my__welcome-action, .kru-my__welcome-action .kru-btn { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) { .kru-my__skeleton { animation: none; } .kru-my__quick-item { transition: none; } }
    `}</style>
  );
}
