"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

interface ExpandableResourceDescriptionProps {
  title: string;
  description?: string | null;
  fallback?: string;
}

export function ExpandableResourceDescription({
  title,
  description,
  fallback = "ดูรายละเอียดและตัวอย่างของสื่อนี้ก่อนเลือกใช้งาน",
}: ExpandableResourceDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonTop = useRef<number | null>(null);
  const text = description?.trim() || fallback;

  useLayoutEffect(() => {
    if (expanded || collapseButtonTop.current === null || !buttonRef.current) return;
    const delta = buttonRef.current.getBoundingClientRect().top - collapseButtonTop.current;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    collapseButtonTop.current = null;
  }, [expanded]);

  const toggle = () => {
    if (expanded && buttonRef.current) {
      collapseButtonTop.current = buttonRef.current.getBoundingClientRect().top;
    }
    setExpanded((current) => !current);
  };

  return (
    <div className="kru-expandable-description">
      <p
        id={descriptionId}
        className={expanded
          ? "kru-expandable-description__text kru-expandable-description__text--expanded"
          : "kru-expandable-description__text"}
      >
        {text}
      </p>
      <button
        ref={buttonRef}
        type="button"
        aria-controls={descriptionId}
        aria-expanded={expanded}
        aria-label={expanded ? `แสดงคำอธิบายของ ${title} ให้น้อยลง` : `ดูคำอธิบายเพิ่มเติมของ ${title}`}
        onClick={toggle}
        className="kru-expandable-description__toggle"
      >
        {expanded ? "แสดงน้อยลง" : "ดูเพิ่มเติม"}
      </button>
      <style jsx>{`
        .kru-expandable-description {
          display: grid;
          gap: var(--sp-2);
        }
        .kru-expandable-description__text {
          min-height: 4.5em;
          margin: 0;
          color: var(--text-body);
          font-size: var(--fs-14);
          line-height: var(--lh-normal);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-wrap: anywhere;
          white-space: pre-line;
        }
        .kru-expandable-description__text--expanded {
          display: block;
          overflow: visible;
          -webkit-line-clamp: unset;
        }
        .kru-expandable-description__toggle {
          min-height: 44px;
          width: max-content;
          max-width: 100%;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--purple-700);
          font: inherit;
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
          cursor: pointer;
        }
        .kru-expandable-description__toggle:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 3px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
