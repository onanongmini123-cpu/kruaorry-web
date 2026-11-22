// Anonymous, once-per-day view counting for the homepage "ยอดนิยม" ranking.
// Nothing here identifies a person: the only identifier is a random id kept in a
// first-party cookie, and no IP address, user id, name or user agent is stored.

export const VIEWER_COOKIE = "kru_vid";
export const VIEWER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const VIEWER_KEY = /^[0-9a-f]{32}$/;

export function isViewerKey(value: unknown): value is string {
  return typeof value === "string" && VIEWER_KEY.test(value);
}

/** 32 random hex characters (a UUID without dashes). */
export function newViewerKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const BOT_PATTERN = /bot|crawl|spider|slurp|scrape|fetch|preview|facebookexternalhit|embedly|headless|phantom|lighthouse|pagespeed|monitor|uptime|curl|wget|python|httpclient|http-client|go-http|java\/|libwww|okhttp|axios|postman|insomnia|wechat|line-poker|whatsapp|telegram|discord/i;

/** Obvious non-human clients (and a missing user agent) are not counted. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 8) return true;
  return BOT_PATTERN.test(userAgent);
}

/** Browser prefetch / prerender requests are not a real visit. */
export function isPrefetchRequest(headers: Pick<Headers, "get">): boolean {
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-purpose") ?? ""}`.toLowerCase();
  return /prefetch|prerender|preview/.test(purpose);
}
