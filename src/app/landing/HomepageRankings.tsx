import { ResourceCard } from "@/components/ui";
import type { RankingRow } from "@/lib/homepageRankings";
import { accessTier } from "@/lib/resourceAccess";
import { resourceHref } from "@/lib/resourceUrl";
import type { Resource } from "@/lib/data";

/**
 * Three horizontally scrollable rows (most hearted, popular, newest). Receives
 * only rows that already have at least three items; renders nothing when none do.
 */
export function HomepageRankings({ rows, heartCounts }: { rows: RankingRow<Resource>[]; heartCounts: Record<string, number> }) {
  if (rows.length === 0) return null;
  return (
    <section className="kru-rankings" aria-label="อันดับสื่อ">
      {rows.map((row) => (
        <div key={row.key} className="kru-rankings__row">
          <h2 id={`rank-${row.key}`}>{row.title}</h2>
          <ul className="kru-rankings__scroller" aria-labelledby={`rank-${row.key}`} tabIndex={0}>
            {row.items.map((resource) => (
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
                  isNew={resource.isNew}
                  trialAvailable={resource.trialAvailable}
                  heartCount={heartCounts[resource.id]}
                  href={resourceHref(resource)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <style>{`
        .kru-rankings { max-width: var(--container-max); margin: var(--sp-9, 48px) auto 0; padding: 0 var(--sp-5); display: grid; gap: var(--sp-8, 40px); }
        .kru-rankings__row { min-width: 0; }
        .kru-rankings__row h2 { margin: 0 0 var(--sp-4); }
        .kru-rankings__scroller { margin: 0; padding: 0 0 var(--sp-3); list-style: none; display: flex; gap: var(--sp-4); overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }
        .kru-rankings__scroller:focus-visible { outline: 3px solid var(--purple-700, #7256a8); outline-offset: 2px; }
        .kru-rankings__scroller > li { flex: 0 0 min(260px, 78vw); min-width: 0; scroll-snap-align: start; }
      `}</style>
    </section>
  );
}
