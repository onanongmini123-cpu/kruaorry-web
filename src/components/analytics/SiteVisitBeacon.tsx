"use client";

import { useEffect } from "react";

const SENT_KEY = "kru:visit-sent-day";

function thaiDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Tells the server "someone visited today" once per Thai day, after the page has loaded.
 * Renders nothing, so it never changes a page's HTML or its cache. Any failure is ignored.
 */
export function SiteVisitBeacon() {
  useEffect(() => {
    const day = thaiDay();
    try {
      if (window.localStorage.getItem(SENT_KEY) === day) return undefined;
    } catch {
      // Storage blocked (private mode): send anyway, the server counts a viewer once a day.
    }
    let cancelled = false;
    const send = () => {
      if (cancelled) return;
      fetch("/api/visit", { method: "POST", credentials: "same-origin", keepalive: true })
        .then((response) => {
          if (response.status !== 204 || response.headers.get("x-visit-accepted") !== "1") return;
          try { window.localStorage.setItem(SENT_KEY, day); } catch { /* ignore */ }
        })
        .catch(() => { /* offline or blocked: ignore */ });
    };
    const timer = window.setTimeout(send, 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  return null;
}
