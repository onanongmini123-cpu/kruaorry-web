"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useId, useRef } from "react";
import { ResourceCard } from "@/components/ui";
import type { Resource } from "@/lib/data";
import { accessTier } from "@/lib/resourceAccess";
import { resourceHref } from "@/lib/resourceUrl";

/** One row shows four cards on desktop; more than that scrolls. */
export const FREE_ROW_VISIBLE = 4;
export const FREE_ROW_LIMIT = 12;

/** Free resources, newest first (resources without a date keep the catalogue's own order after the dated ones). */
export function pickFreeSamples<T extends { accessMode: string; publishedAt?: string | null }>(resources: readonly T[], limit = FREE_ROW_LIMIT): T[] {
  return resources
    .map((resource, index) => ({ resource, index, time: resource.publishedAt ? Date.parse(resource.publishedAt) : Number.NaN }))
    .filter(({ resource }) => resource.accessMode === "public")
    .sort((a, b) => {
      const aHas = Number.isFinite(a.time);
      const bHas = Number.isFinite(b.time);
      if (aHas && bHas && a.time !== b.time) return b.time - a.time;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.index - b.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ resource }) => resource);
}

/**
 * "สื่อฟรี ใช้ได้ทันที": a full row of four cards on desktop, swipeable on phones, scrolls
 * (with arrow buttons) when there are more than four, and centred when there are fewer so
 * no empty gap is left on the right.
 */
export function FreeSamplesRow({ samples }: { samples: readonly Resource[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const scrolls = samples.length > FREE_ROW_VISIBLE;

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    const item = track?.querySelector<HTMLElement>("li");
    if (!track || !item) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * (item.offsetWidth + 16), behavior: reduced ? "auto" : "smooth" });
  }, []);

  return (
    <div className="kru-free-row" data-count={Math.min(samples.length, FREE_ROW_VISIBLE)}>
      <div className="kru-free-row__head">
        <h3 id={headingId}>สื่อฟรี ใช้ได้ทันที</h3>
        {scrolls && (
          <div className="kru-free-row__arrows" aria-label="เลื่อนสื่อฟรี">
            <button type="button" aria-label="ดูสื่อฟรีก่อนหน้า" onClick={() => step(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <button type="button" aria-label="ดูสื่อฟรีถัดไป" onClick={() => step(1)}><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        )}
      </div>
      <ul ref={trackRef} className="kru-free-row__track" aria-labelledby={headingId} tabIndex={0}>
        {samples.map((sample) => (
          <li key={sample.id}>
            <ResourceCard
              title={sample.title}
              description={sample.description}
              meta={sample.meta}
              category={sample.category}
              deliveryMode={sample.affordance}
              gradeLevels={sample.gradeLevels}
              accessTier={accessTier(sample.accessMode)}
              coverImageUrl={sample.coverImageUrl}
              isNew={sample.isNew}
              href={resourceHref(sample)}
            />
          </li>
        ))}
      </ul>
      <style>{`
        .kru-free-row { margin-top: var(--sp-7); min-width: 0; }
        .kru-free-row__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
        .kru-free-row__head h3 { margin: 0; font-size: var(--fs-20); }
        .kru-free-row__arrows { display: none; gap: 7px; }
        .kru-free-row__arrows button { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid var(--border-subtle); border-radius: var(--r-pill); background: var(--white); color: var(--purple-700); box-shadow: var(--shadow-xs); cursor: pointer; }
        .kru-free-row__track { margin: 0; padding: 0 0 var(--sp-3); list-style: none; display: flex; gap: var(--sp-4); overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }
        .kru-free-row__track:focus-visible { outline: 3px solid var(--purple-700, #7256a8); outline-offset: 2px; }
        .kru-free-row__track > li { flex: 0 0 min(260px, 78vw); min-width: 0; scroll-snap-align: start; }
        @media (min-width: 720px) {
          /* Four cards fill the row exactly: (100% - 3 gaps) / 4. */
          .kru-free-row__track > li { flex: 0 0 calc((100% - 3 * var(--sp-4)) / 4); }
          .kru-free-row[data-count="1"] .kru-free-row__track, .kru-free-row[data-count="2"] .kru-free-row__track, .kru-free-row[data-count="3"] .kru-free-row__track { justify-content: center; }
          .kru-free-row__arrows { display: flex; }
        }
        @media (min-width: 720px) and (max-width: 1000px) {
          .kru-free-row__track > li { flex-basis: calc((100% - 2 * var(--sp-4)) / 3); }
        }
      `}</style>
    </div>
  );
}
