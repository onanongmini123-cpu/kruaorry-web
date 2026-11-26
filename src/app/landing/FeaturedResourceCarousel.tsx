"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Sparkles, Star } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { PublicResourceCover } from "@/app/resources/PublicResourceCover";
import type { ResourceAffordance } from "@/components/ui";
import { accessLabel } from "@/lib/resourceAccess";
import { resourceHref } from "@/lib/resourceUrl";

export type FeaturedCarouselResource = {
  id: string;
  /** Readable address; the link falls back to the id until one exists. */
  slug?: string | null;
  title: string;
  meta: string;
  description: string | null;
  affordance: ResourceAffordance;
  coverImageUrl: string | null;
  requiredPlanNames: string[];
  accessMode: "public" | "authenticated" | "plans" | "locked";
  isNew: boolean;
  /** Pro resource with watermarked previews anyone can look at. */
  trialAvailable?: boolean;
  featuredRank: number | null;
  reviewAverage: number | null;
  reviewCount: number;
};

type RankedResource = { id: string; featuredRank: number | null };

/**
 * Featured configuration leads when present, then the rest of the library in the
 * backend's latest-first order. Duplicate ids never create duplicate slides,
 * even if a caller accidentally joins the same row twice.
 */
export function selectFeaturedResources<T extends RankedResource>(resources: readonly T[], limit = 40): T[] {
  const unique = resources.filter((resource, index, all) => (
    all.findIndex((candidate) => candidate.id === resource.id) === index
  ));
  const ranked = unique
    .map((resource, sourceIndex) => ({ resource, sourceIndex }))
    .filter(({ resource }) => resource.featuredRank !== null && Number.isFinite(resource.featuredRank))
    .sort((left, right) => (
      (left.resource.featuredRank as number) - (right.resource.featuredRank as number)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ resource }) => resource);
  const rankedIds = new Set(ranked.map((resource) => resource.id));
  // Staff-chosen resources lead; every other resource follows in the backend's
  // latest-first order, so the whole library flows past instead of only five.
  return [...ranked, ...unique.filter((resource) => !rankedIds.has(resource.id))].slice(0, Math.max(0, limit));
}

export function featuredAccessLabel(resource: Pick<FeaturedCarouselResource, "accessMode" | "requiredPlanNames">): string {
  return accessLabel(resource.accessMode);
}

interface FeaturedResourceCarouselProps {
  resources: readonly FeaturedCarouselResource[];
  loading?: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const AUTOPLAY_PX_PER_SECOND = 36;

export function FeaturedResourceCarousel({ resources, loading = false }: FeaturedResourceCarouselProps) {
  const featured = useMemo(() => selectFeaturedResources(resources), [resources]);
  const trackRef = useRef<HTMLDivElement>(null);
  const firstSetRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const headingId = useId();
  const trackId = useId();
  const loops = featured.length > 1;

  // Endless slow drift: the list is rendered twice, and when the first copy has
  // scrolled out of view the position jumps back by exactly one copy. It stops
  // while a finger, the pointer or keyboard focus is on it, and never starts for
  // people who asked for reduced motion.
  useEffect(() => {
    const track = trackRef.current;
    const firstSet = firstSetRef.current;
    if (!loops || !track || !firstSet || prefersReducedMotion()) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;
      const setWidth = firstSet.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 16);
      if (!pausedRef.current && setWidth > 0 && !document.hidden) {
        track.scrollLeft += (AUTOPLAY_PX_PER_SECOND * elapsed) / 1000;
      }
      if (setWidth > 0) {
        if (track.scrollLeft >= setWidth) track.scrollLeft -= setWidth;
        else if (track.scrollLeft <= 0 && pausedRef.current) track.scrollLeft += setWidth;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [loops]);

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    const slide = track?.querySelector<HTMLElement>(".kru-featured-carousel__slide");
    if (!track || !slide) return;
    track.scrollBy({ left: direction * (slide.offsetWidth + 16), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  };

  if (loading) {
    return (
      <div className="kru-featured-carousel kru-featured-carousel--state" role="status">
        <span className="kru-featured-carousel__state-icon"><Sparkles size={24} aria-hidden="true" /></span>
        <strong>กำลังเลือกสื่อเด่นให้คุณครู</strong>
        <span>อีกสักครู่สื่อที่เผยแพร่จริงจะปรากฏตรงนี้ค่ะ</span>
        <CarouselStyles />
      </div>
    );
  }

  if (featured.length === 0) {
    return (
      <div className="kru-featured-carousel kru-featured-carousel--state" role="status">
        <span className="kru-featured-carousel__state-icon"><Sparkles size={24} aria-hidden="true" /></span>
        <strong>กำลังเตรียมสื่อแนะนำชุดใหม่</strong>
        <span>ระหว่างนี้เปิดดูคลังสื่อทั้งหมดได้เลยค่ะ</span>
        <Link href="/resources">ไปที่คลังสื่อ <ChevronRight size={16} aria-hidden="true" /></Link>
        <CarouselStyles />
      </div>
    );
  }

  const renderSlide = (resource: FeaturedCarouselResource, index: number, clone: boolean) => {
    const accessLabel = featuredAccessLabel(resource);
    const showReview = resource.reviewCount > 0 && resource.reviewAverage !== null;
    const slideProps = clone
      ? { "aria-hidden": true as const }
      : { role: "group", "aria-roledescription": "slide", "aria-label": `${index + 1} จาก ${featured.length}: ${resource.title}` };
    return (
      <div key={`${clone ? "c" : "o"}-${resource.id}`} className="kru-featured-carousel__slide" {...slideProps}>
        <Link href={resourceHref(resource)} className="kru-featured-carousel__card" tabIndex={clone ? -1 : undefined}>
          <div className="kru-featured-carousel__cover">
            <PublicResourceCover
              title={resource.title}
              url={resource.coverImageUrl}
              deliveryMode={resource.affordance}
              fallback="neutral"
              eager={!clone && index < 4}
              style={{ aspectRatio: "4 / 3" }}
            />
            <div className="kru-featured-carousel__badges">
              {resource.isNew && <span className="kru-featured-carousel__badge kru-featured-carousel__badge--new">ใหม่</span>}
              <span className={`kru-featured-carousel__badge kru-featured-carousel__badge--${resource.accessMode}`}>
                {resource.accessMode !== "public" && <Lock size={13} aria-hidden="true" />}
                {accessLabel}
              </span>
              {resource.trialAvailable && resource.accessMode === "plans" && (
                <span className="kru-featured-carousel__badge kru-featured-carousel__badge--trial">ทดลองได้</span>
              )}
            </div>
          </div>
          <div className="kru-featured-carousel__body">
            <h3>{resource.title}</h3>
            <p>{resource.meta || resource.description || "สื่อพร้อมใช้สำหรับห้องเรียน"}</p>
            <div className="kru-featured-carousel__meta">
              {showReview ? (
                <span aria-label={`คะแนน ${resource.reviewAverage!.toFixed(1)} จาก 5, ${resource.reviewCount} รีวิว`}>
                  <Star size={15} fill="currentColor" aria-hidden="true" />
                  {resource.reviewAverage!.toFixed(1)} ({resource.reviewCount.toLocaleString("th-TH")})
                </span>
              ) : <span />}
              <span className="kru-featured-carousel__detail">ดูรายละเอียด <ChevronRight size={15} aria-hidden="true" /></span>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  return (
    <section
      className="kru-featured-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={headingId}
    >
      <div className="kru-featured-carousel__header">
        <div>
          <span className="kru-featured-carousel__eyebrow">คัดสรรจากคลังจริง</span>
          <h2 id={headingId}>สื่อและเกมสำหรับคุณครู</h2>
        </div>
        {featured.length > 1 && (
          <div className="kru-featured-carousel__arrows" aria-label="เลื่อนสื่อแนะนำ">
            <button type="button" aria-label="ดูสื่อก่อนหน้า" aria-controls={trackId} onClick={() => step(-1)}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" aria-label="ดูสื่อถัดไป" aria-controls={trackId} onClick={() => step(1)}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        id={trackId}
        className="kru-featured-carousel__track"
        role="group"
        tabIndex={0}
        aria-label="สื่อแนะนำ เลื่อนวนอัตโนมัติ แตะหรือเอาเมาส์วางเพื่อหยุด เลื่อนด้วยนิ้วหรือปุ่มลูกศร"
        onKeyDown={handleKeyDown}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
        onTouchStart={pause}
        onTouchEnd={resume}
        onTouchCancel={resume}
      >
        <div ref={firstSetRef} className="kru-featured-carousel__set">
          {featured.map((resource, index) => renderSlide(resource, index, false))}
        </div>
        {loops && (
          <div className="kru-featured-carousel__set" aria-hidden="true">
            {featured.map((resource, index) => renderSlide(resource, index, true))}
          </div>
        )}
      </div>
      <CarouselStyles />
    </section>
  );
}

function CarouselStyles() {
  return (
    <style jsx global>{`
      .kru-featured-carousel {
        min-width: 0;
        width: min(100%, var(--container-max));
        margin: 0 auto;
        padding: var(--sp-7) var(--sp-5) var(--sp-5);
      }

      .kru-featured-carousel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-4);
        padding: 0 0 var(--sp-4);
      }

      .kru-featured-carousel__eyebrow {
        color: var(--pink-700);
        font-size: var(--fs-12);
        font-weight: var(--fw-bold);
        letter-spacing: var(--ls-wide);
      }

      .kru-featured-carousel h2 {
        margin-top: 3px;
        font-size: var(--fs-20);
      }

      .kru-featured-carousel__arrows {
        display: flex;
        gap: 7px;
      }

      .kru-featured-carousel__arrows button {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-pill);
        background: var(--white);
        color: var(--purple-700);
        box-shadow: var(--shadow-xs);
        cursor: pointer;
      }

      .kru-featured-carousel__arrows button:disabled {
        opacity: .4;
        cursor: not-allowed;
      }

      .kru-featured-carousel__track {
        min-width: 0;
        display: flex;
        gap: var(--sp-4);
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding: 4px 0 var(--sp-4);
        scrollbar-width: none;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
        mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
      }

      .kru-featured-carousel__track::-webkit-scrollbar {
        display: none;
      }

      .kru-featured-carousel__set {
        display: flex;
        flex: 0 0 auto;
        gap: var(--sp-4);
      }

      .kru-featured-carousel__track:focus-visible {
        border-radius: var(--r-md);
      }

      .kru-featured-carousel__slide {
        min-width: 0;
        flex: 0 0 clamp(220px, 24vw, 272px);
      }

      .kru-featured-carousel__card {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, .95);
        border-radius: var(--r-lg);
        background: var(--surface-card);
        box-shadow: var(--shadow-sm);
        color: inherit;
        text-decoration: none;
        transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
      }

      .kru-featured-carousel__card:hover {
        color: inherit;
        text-decoration: none;
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .kru-featured-carousel__cover {
        position: relative;
        overflow: hidden;
        background: var(--wash-hero);
      }

      .kru-featured-carousel__badges {
        position: absolute;
        top: 9px;
        left: 9px;
        right: 9px;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        flex-wrap: wrap;
      }

      .kru-featured-carousel__badge {
        min-height: 25px;
        padding: 4px 9px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, .86);
        border-radius: var(--r-pill);
        background: rgba(255, 255, 255, .94);
        box-shadow: var(--shadow-xs);
        color: var(--status-member-fg);
        font-size: var(--fs-12);
        font-weight: var(--fw-bold);
        line-height: 1.2;
      }

      .kru-featured-carousel__badge--new {
        background: var(--pink-600);
        color: var(--white);
      }

      .kru-featured-carousel__badge--trial {
        background: rgba(232, 244, 255, .96);
        color: var(--status-info-fg, #1d4f91);
      }

      .kru-featured-carousel__badge--public {
        background: rgba(234, 248, 242, .96);
        color: var(--status-success-fg);
      }

      .kru-featured-carousel__badge--locked {
        background: rgba(248, 247, 252, .96);
        color: var(--text-muted);
      }

      .kru-featured-carousel__body {
        flex: 1;
        padding: var(--sp-4);
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
      }

      .kru-featured-carousel__body h3 {
        min-height: 2.6em;
        display: -webkit-box;
        overflow: hidden;
        font-size: var(--fs-16);
        line-height: var(--lh-snug);
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .kru-featured-carousel__body p {
        min-height: 2.9em;
        display: -webkit-box;
        overflow: hidden;
        color: var(--text-muted);
        font-size: var(--fs-13);
        line-height: 1.45;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .kru-featured-carousel__meta {
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-2);
        color: var(--amber-700);
        font-size: var(--fs-12);
        font-weight: var(--fw-semibold);
      }

      .kru-featured-carousel__meta > span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .kru-featured-carousel__detail {
        color: var(--purple-700);
        white-space: nowrap;
      }

      .kru-featured-carousel--state {
        min-height: 330px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--sp-3);
        text-align: center;
        color: var(--text-muted);
        background: linear-gradient(145deg, rgba(255,255,255,.82), rgba(237,231,255,.78));
      }

      .kru-featured-carousel--state strong {
        color: var(--text-strong);
        font-size: var(--fs-18);
      }

      .kru-featured-carousel--state a {
        min-height: var(--tap-min);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: var(--fw-semibold);
      }

      .kru-featured-carousel__state-icon {
        width: 52px;
        height: 52px;
        display: grid;
        place-items: center;
        border-radius: var(--r-lg);
        background: var(--purple-100);
        color: var(--purple-700);
      }

      @media (max-width: 560px) {
        .kru-featured-carousel {
          padding: var(--sp-6) var(--sp-4) var(--sp-4);
        }

        .kru-featured-carousel__slide {
          flex-basis: min(72vw, 260px);
        }

        .kru-featured-carousel__arrows {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .kru-featured-carousel__card {
          transition: none;
        }

        .kru-featured-carousel__track {
          scroll-behavior: auto;
        }
      }
    `}</style>
  );
}
