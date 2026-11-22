"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type UIEvent } from "react";
import { bannerLinkTarget, type PromoBanner } from "@/lib/promoBanners";

const AUTOPLAY_MS = 5000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Server and first paint assume "reduced" so nothing moves before the real setting is known. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
}

/**
 * Promo banner carousel above the featured resources. Staff manage the slides in
 * the admin console. Renders nothing when there is no banner. Moves on by itself
 * every 5 seconds, stops while a finger / the pointer / keyboard focus is on it,
 * has an explicit pause button, never auto-plays for reduced motion, and the
 * frame has a fixed aspect ratio so the page does not jump while pictures load.
 */
export function PromoBanners({ banners }: { banners: readonly PromoBanner[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reduced = useReducedMotion();
  const headingId = useId();
  const trackId = useId();
  const count = banners.length;
  const tall = count > 0 && banners.every((banner) => banner.imageMobileUrl);

  const goTo = useCallback((requested: number) => {
    if (count === 0) return;
    const next = ((requested % count) + count) % count;
    const track = trackRef.current;
    const slide = slideRefs.current[next];
    if (track && slide) track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setActive(next);
  }, [count]);

  const playing = count > 1 && !reduced && !userPaused && !hold;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setTimeout(() => goTo(active + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active, goTo]);

  if (count === 0) return null;

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    slideRefs.current.forEach((slide, index) => {
      if (!slide) return;
      const distance = Math.abs((slide.offsetLeft - track.offsetLeft) - track.scrollLeft);
      if (distance < best) { best = distance; nearest = index; }
    });
    setActive((current) => (current === nearest ? current : nearest));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(active + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(active - 1); }
    else if (event.key === "Home") { event.preventDefault(); goTo(0); }
    else if (event.key === "End") { event.preventDefault(); goTo(count - 1); }
  };

  return (
    <section
      className="kru-promo"
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={headingId}
      data-tall={tall ? "true" : undefined}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      onTouchStart={() => setHold(true)}
      onTouchEnd={() => setHold(false)}
      onTouchCancel={() => setHold(false)}
    >
      <h2 id={headingId} className="kru-visually-hidden">ประชาสัมพันธ์</h2>
      <div
        ref={trackRef}
        id={trackId}
        className="kru-promo__track"
        role="group"
        tabIndex={0}
        aria-label="แบนเนอร์ประชาสัมพันธ์ ปัดซ้ายขวาหรือใช้ปุ่มลูกศร"
        aria-live={playing ? "off" : "polite"}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
      >
        {banners.map((banner, index) => {
          const picture = (
            <picture>
              {banner.imageMobileUrl && <source media="(max-width: 719px)" srcSet={banner.imageMobileUrl} />}
              <img
                src={banner.imageUrl}
                alt={banner.altText}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === 0 ? "high" : "auto"}
                draggable={false}
              />
            </picture>
          );
          const target = banner.linkUrl ? bannerLinkTarget(banner.linkUrl) : null;
          return (
            <div
              key={`${index}-${banner.imageUrl}`}
              ref={(node) => { slideRefs.current[index] = node; }}
              className="kru-promo__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} จาก ${count}`}
            >
              {target ? (
                target.external ? (
                  <a href={target.href} target="_blank" rel="noopener noreferrer" className="kru-promo__link">{picture}</a>
                ) : (
                  <Link href={target.href} className="kru-promo__link">{picture}</Link>
                )
              ) : (
                <div className="kru-promo__link">{picture}</div>
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="kru-promo__controls">
          <button type="button" className="kru-promo__arrow" aria-label="แบนเนอร์ก่อนหน้า" aria-controls={trackId} onClick={() => goTo(active - 1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div className="kru-promo__dots" aria-label="เลือกแบนเนอร์">
            {banners.map((banner, index) => (
              <button
                key={`${index}-${banner.imageUrl}`}
                type="button"
                aria-label={`ไปแบนเนอร์ที่ ${index + 1}`}
                aria-controls={trackId}
                aria-current={active === index ? "true" : undefined}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          {!reduced && (
            <button type="button" className="kru-promo__arrow" aria-label={userPaused ? "เล่นแบนเนอร์อัตโนมัติ" : "หยุดเลื่อนอัตโนมัติ"} aria-pressed={userPaused} onClick={() => setUserPaused((value) => !value)}>
              {userPaused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="kru-promo__arrow" aria-label="แบนเนอร์ถัดไป" aria-controls={trackId} onClick={() => goTo(active + 1)}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}

      <style>{`
        .kru-promo { width: min(100%, var(--container-max)); margin: 0 auto; padding: var(--sp-6) var(--sp-5) 0; }
        .kru-promo__track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: var(--r-lg); overscroll-behavior-x: contain; }
        .kru-promo__track::-webkit-scrollbar { display: none; }
        .kru-promo__track:focus-visible { outline: 3px solid var(--purple-700, #7256a8); outline-offset: 3px; }
        .kru-promo__slide { flex: 0 0 100%; min-width: 0; scroll-snap-align: start; }
        .kru-promo__link { display: block; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--r-lg); background: var(--purple-50); color: inherit; }
        .kru-promo[data-tall="true"] .kru-promo__link { aspect-ratio: 4 / 5; }
        .kru-promo picture, .kru-promo img { display: block; width: 100%; height: 100%; }
        .kru-promo img { object-fit: cover; }
        .kru-promo__controls { margin-top: var(--sp-3); display: flex; align-items: center; justify-content: center; gap: var(--sp-2); }
        .kru-promo__arrow { width: var(--tap-min, 44px); height: var(--tap-min, 44px); display: grid; place-items: center; border: 1px solid var(--border-subtle); border-radius: var(--r-pill); background: var(--white); color: var(--purple-700); cursor: pointer; }
        .kru-promo__dots { display: flex; align-items: center; }
        .kru-promo__dots button { width: var(--tap-min, 44px); height: var(--tap-min, 44px); padding: 0; border: 0; background: transparent; display: grid; place-items: center; cursor: pointer; }
        .kru-promo__dots button::after { content: ""; width: 10px; height: 10px; border-radius: var(--r-pill); background: var(--purple-200); transition: width var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard); }
        .kru-promo__dots button[aria-current="true"]::after { width: 26px; background: var(--purple-600); }
        @media (min-width: 720px) { .kru-promo[data-tall="true"] .kru-promo__link { aspect-ratio: 16 / 9; } .kru-promo__link { max-height: 520px; } }
        @media (max-width: 560px) { .kru-promo { padding-inline: var(--sp-4); } .kru-promo__controls .kru-promo__arrow { width: 40px; height: 40px; } }
        @media (prefers-reduced-motion: reduce) { .kru-promo__dots button::after { transition: none; } }
      `}</style>
    </section>
  );
}
