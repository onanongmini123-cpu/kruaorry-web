"use client";

import type { AnchorHTMLAttributes } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";

interface TrackedAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** One or more events to report when the link is activated. */
  events: ReadonlyArray<{ name: AnalyticsEventName; properties?: Record<string, unknown> }>;
}

/** A plain link that reports what it was for when clicked; the link itself is unchanged. */
export function TrackedAnchor({ events, onClick, ...anchor }: TrackedAnchorProps) {
  return (
    <a
      {...anchor}
      onClick={(event) => {
        for (const item of events) trackEvent(item.name, item.properties);
        onClick?.(event);
      }}
    />
  );
}
