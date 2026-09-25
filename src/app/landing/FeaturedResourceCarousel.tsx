"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Sparkles, Star } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { PublicResourceCover } from "@/app/resources/PublicResourceCover";
import type { ResourceAffordance } from "@/components/ui";

export type FeaturedCarouselResource = {
  id: string;
  title: string;
  meta: string;
  description: string | null;
  affordance: ResourceAffordance;
  coverImageUrl: string | null;
  requiredPlanNames: string[];
  accessMode: "public" | "authenticated" | "plans" | "locked";
  isNew: boolean;
  featuredRank: number | null;
  reviewAverage: number | null;
  reviewCount: number;
};

type RankedResource = { id: string; featuredRank: number | null };

/**
 * Featured configuration is authoritative when present. Without it, the
 * backend's latest-first ordering is retained. Duplicate ids never create
 * duplicate slides, even if a caller accidentally joins the same row twice.
 */
export function selectFeaturedResources<T extends RankedResource>(resources: readonly T[], limit = 5): T[] {
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

  return (ranked.length > 0 ? ranked : unique).slice(0, Math.max(0, limit));
}

export function featuredAccessLabel(resource: Pick<FeaturedCarouselResource, "accessMode" | "requiredPlanNames">): string {
  switch (resource.accessMode) {
    case "public":
      return "ใช้ได้ฟรี";
    case "authenticated":
      return "สำหรับสมาชิก";
    case "plans":
      return resource.requiredPlanNames.length > 0
        ? `สำหรับ ${resource.requiredPlanNames.join(" หรือ ")}`
        : "สำหรับแพ็กสมาชิก";
    case "locked":
      return "ยังไม่เปิดใช้งาน";
  }
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

export function FeaturedResourceCarousel({ resources, loading = false }: FeaturedResourceCarouselProps) {
  const featured = useMemo(() => selectFeaturedResources(resources), [resources]);
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const headingId = useId();
  const trackId = useId();
  const safeActiveIndex = Math.min(activeIndex, Math.max(featured.length - 1, 0));

  const goTo = useCallback((requestedIndex: number) => {
    if (featured.length === 0) return;
    const nextIndex = Math.max(0, Math.min(requestedIndex, featured.length - 1));
    const track = trackRef.current;
    const slide = slideRefs.current[nextIndex];
    if (track && slide) {
      track.scrollTo({
        left: slide.offsetLeft - track.offsetLeft,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
    setActiveIndex(nextIndex);
  }, [featured.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(safeActiveIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(safeActiveIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(featured.length - 1);
    }
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    slideRefs.current.forEach((slide, index) => {
      if (!slide) return;
      const distance = Math.abs((slide.offsetLeft - track.offsetLeft) - track.scrollLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex((current) => current === nearestIndex ? current : nearestIndex);
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
          <h2 id={headingId}>สื่อแนะนำสำหรับคุณครู</h2>
        </div>
        {featured.length > 1 && (
          <div className="kru-featured-carousel__arrows" aria-label="เลื่อนสื่อแนะนำ">
            <button
              type="button"
              aria-label="ดูสื่อก่อนหน้า"
              aria-controls={trackId}
              disabled={safeActiveIndex === 0}
              onClick={() => goTo(safeActiveIndex - 1)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="ดูสื่อถัดไป"
              aria-controls={trackId}
              disabled={safeActiveIndex === featured.length - 1}
              onClick={() => goTo(safeActiveIndex + 1)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        id={trackId}
        className="kru-featured-carousel__track"
        role="list"
        tabIndex={0}
        aria-label="สื่อแนะนำ เลื่อนด้วยนิ้วหรือปุ่มลูกศร"
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        {featured.map((resource, index) => {
          const accessLabel = featuredAccessLabel(resource);
          const showReview = resource.reviewCount > 0 && resource.reviewAverage !== null;
          return (
            <article
              key={resource.id}
              ref={(node) => { slideRefs.current[index] = node; }}
              className="kru-featured-carousel__slide"
              role="listitem"
              aria-roledescription="slide"
              aria-label={`${index + 1} จาก ${featured.length}: ${resource.title}`}
            >
              <Link href={`/resources/${resource.id}`} className="kru-featured-carousel__card">
                <div className="kru-featured-carousel__cover">
                  <PublicResourceCover
                    title={resource.title}
                    url={resource.coverImageUrl}
                    deliveryMode={resource.affordance}
                    fallback="neutral"
                    eager={index < 2}
                    style={{ aspectRatio: "4 / 3" }}
                  />
                  <div className="kru-featured-carousel__badges">
                    {resource.isNew && <span className="kru-featured-carousel__badge kru-featured-carousel__badge--new">ใหม่</span>}
                    <span className={`kru-featured-carousel__badge kru-featured-carousel__badge--${resource.accessMode}`}>
                      {resource.accessMode !== "public" && <Lock size={13} aria-hidden="true" />}
                      {accessLabel}
                    </span>
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
            </article>
          );
        })}
      </div>

      {featured.length > 1 && (
        <div className="kru-featured-carousel__dots" aria-label="เลือกสื่อแนะนำ">
          {featured.map((resource, index) => (
            <button
              key={resource.id}
              type="button"
              aria-label={`ไปยังสื่อ ${index + 1}: ${resource.title}`}
              aria-controls={trackId}
              aria-current={safeActiveIndex === index ? "true" : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}

      <span className="kru-featured-carousel__live" aria-live="polite" aria-atomic="true">
        สื่อ {safeActiveIndex + 1} จาก {featured.length}: {featured[safeActiveIndex]?.title}
      </span>
      <CarouselStyles />
    </section>
  );
}

function CarouselStyles() {
  return (
    <style jsx global>{`
      .kru-featured-carousel {
        min-width: 0;
        width: min(100%, 560px);
        padding: var(--sp-5);
        border: 1px solid rgba(195, 176, 252, .7);
        border-radius: var(--r-panel);
        background: rgba(255, 255, 255, .72);
        box-shadow: 0 24px 64px rgba(70, 49, 139, .13);
        backdrop-filter: blur(14px);
      }

      .kru-featured-carousel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-4);
        padding: 0 var(--sp-1) var(--sp-4);
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
        scroll-snap-type: x mandatory;
        scroll-padding-inline: 2px;
        padding: 2px calc(42% + 2px) var(--sp-4) 2px;
        scrollbar-width: thin;
        scrollbar-color: var(--purple-200) transparent;
      }

      .kru-featured-carousel__track:focus-visible {
        border-radius: var(--r-md);
      }

      .kru-featured-carousel__slide {
        min-width: 0;
        flex: 0 0 calc(58% - 8px);
        scroll-snap-align: start;
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

      .kru-featured-carousel__dots {
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .kru-featured-carousel__dots button {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: var(--r-pill);
        display: grid;
        place-items: center;
        background: transparent;
        cursor: pointer;
      }

      .kru-featured-carousel__dots button::after {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: var(--r-pill);
        background: var(--purple-200);
        transition: width var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
      }

      .kru-featured-carousel__dots button[aria-current="true"]::after {
        width: 28px;
        background: var(--purple-600);
      }

      .kru-featured-carousel__live {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
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
          padding: var(--sp-4);
          border-radius: var(--r-lg);
        }

        .kru-featured-carousel__slide {
          flex-basis: calc(100% - 8px);
        }

        .kru-featured-carousel__arrows {
          display: none;
        }

        .kru-featured-carousel__track {
          padding-right: 10px;
          scrollbar-width: none;
        }

        .kru-featured-carousel__track::-webkit-scrollbar {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .kru-featured-carousel__card,
        .kru-featured-carousel__dots button::after {
          transition: none;
        }

        .kru-featured-carousel__track {
          scroll-behavior: auto;
        }
      }
    `}</style>
  );
}
