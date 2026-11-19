"use client";

import { useEffect, useRef } from "react";

/**
 * Tells the server once per page view that this resource page was looked at.
 * Renders nothing. The server decides whether the visit counts (it skips admins,
 * bots and prefetches) and keeps one anonymous row per viewer per day.
 */
export function ResourceViewBeacon({ resourceId }: { resourceId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/resources/${encodeURIComponent(resourceId)}/view`, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }, [resourceId]);
  return null;
}
