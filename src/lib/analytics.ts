/**
 * One place that product code reports what visitors do. Nothing here knows
 * about a vendor: providers (Google Tag Manager/GA4, Plausible, Vercel
 * Analytics, a first-party endpoint…) are plugged in with
 * `registerAnalyticsProvider`, so changing tool never touches business code.
 *
 * Rules, enforced in `sanitizeProperties`:
 *  - only the allow-listed property names below are ever sent;
 *  - no emails, phone numbers, names, user ids or free text from forms;
 *  - events are reported only where the thing provably happened (a click, a
 *    page view, a successful call). There is deliberately no game_start or
 *    game_complete: external games do not call back into this site, so
 *    those cannot be known. See docs/analytics.md.
 */

export type AnalyticsEventName =
  | "home_view"
  | "search"
  | "resource_view"
  | "resource_start"
  | "outbound_game_open"
  | "signup_start"
  | "signup_complete"
  | "pricing_view"
  | "upgrade_click"
  | "checkout_start"
  | "payment_submit"
  | "pro_activated"
  | "favorite_add"
  | "download";

export type AnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
}

export interface AnalyticsProvider {
  name: string;
  track(event: AnalyticsEvent): void;
}

/** Property names that may be reported. Anything else is dropped. */
export const ALLOWED_PROPERTIES = new Set([
  "resource_id",
  "slug",
  "access_tier",
  "delivery_mode",
  "grade",
  "subject",
  "plan_id",
  "source",
  "mode",
  "stage",
  "cta",
  "results_count",
  "query_length",
  "term",
  "filters_count",
  "authenticated",
]);

const MAX_STRING = 80;
const EMAIL_LIKE = /\S+@\S+/;
const PHONE_LIKE = /\d[\d\s().-]{7,}\d/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeProperties(properties: Record<string, unknown> | undefined): AnalyticsProperties {
  const clean: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "string") {
      const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_STRING);
      // A resource id is a UUID (digits and hyphens), not a phone number.
      if (!text || EMAIL_LIKE.test(text) || (PHONE_LIKE.test(text) && !UUID_LIKE.test(text))) continue;
      clean[key] = text;
    }
  }
  return clean;
}

const providers: AnalyticsProvider[] = [];

export function registerAnalyticsProvider(provider: AnalyticsProvider): () => void {
  providers.push(provider);
  return () => {
    const index = providers.indexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}

type DataLayerWindow = Window & {
  dataLayer?: unknown[];
  plausible?: (name: string, options?: { props?: AnalyticsProperties }) => void;
};

/**
 * Adapters for tools that are already on the page when present (a Tag Manager
 * snippet, a Plausible script). Without any of them an event goes nowhere,
 * which is the safe default.
 */
const pageProviders: AnalyticsProvider[] = [
  {
    name: "dataLayer",
    track({ name, properties }) {
      const target = window as DataLayerWindow;
      if (Array.isArray(target.dataLayer)) target.dataLayer.push({ event: name, ...properties });
    },
  },
  {
    name: "plausible",
    track({ name, properties }) {
      const target = window as DataLayerWindow;
      if (typeof target.plausible === "function") target.plausible(name, { props: properties });
    },
  },
];

/** Report something that happened. Never throws and never blocks the page. */
export function trackEvent(name: AnalyticsEventName, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const event: AnalyticsEvent = { name, properties: sanitizeProperties(properties) };
  for (const provider of [...pageProviders, ...providers]) {
    try {
      provider.track(event);
    } catch {
      // A broken analytics tool must never break the product.
    }
  }
}
