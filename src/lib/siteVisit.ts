import { createHmac, randomBytes } from "node:crypto";

/** First-party cookie that holds a random id (no personal data). One year. */
export const VISITOR_COOKIE = "kru_vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VISITOR_ID = /^[0-9a-f]{32}$/;

// Crawlers, link previews (LINE, Facebook, Slack...), headless browsers and command-line
// clients are not people. Matched against the user agent; an empty user agent is not counted.
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|line-poker|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|axios|node-fetch|go-http|java\//i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua.length === 0 || NOT_A_PERSON.test(ua);
}

/** Calendar day in Thailand (YYYY-MM-DD), the same day boundary as the database. */
export function bangkokDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function isVisitorId(value: string | null | undefined): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

export function newVisitorId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * The only value stored per visit: HMAC-SHA256(secret, id + Thai date), 64 hex characters.
 * Without the secret it cannot be linked back to the cookie, and it changes every day.
 */
export function viewerDayKey(secret: string, visitorId: string, day: string): string {
  return createHmac("sha256", secret).update(`${visitorId}:${day}`).digest("hex");
}
