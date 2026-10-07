"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";

/** Reports one event the first time its section is mostly on screen. */
export function TrackOnVisible({ event, properties, children }: {
  event: AnalyticsEventName;
  properties?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackEvent(event, properties);
        observer.disconnect();
      }
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
    // Properties describe the section as first rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref}>{children}</div>;
}
