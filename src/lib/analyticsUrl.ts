import type { BeforeSendEvent } from "@vercel/analytics/next";

/** Remove query parameters and fragments before a page view reaches Vercel. */
export function redactAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    // Do not report a path that contains a likely address or phone number.
    const path = decodeURIComponent(url.pathname);
    if (/\S+@\S+/.test(path) || /\d[\d\s().-]{7,}\d/.test(path)) return null;
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    // A malformed URL must not be reported verbatim.
    return null;
  }
}
