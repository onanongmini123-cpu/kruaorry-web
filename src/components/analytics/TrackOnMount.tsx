"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";

/** Reports one event when the page (or section) first appears. Renders nothing. */
export function TrackOnMount({ event, properties }: { event: AnalyticsEventName; properties?: Record<string, unknown> }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent(event, properties);
    // The first render's properties are the ones that describe this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
