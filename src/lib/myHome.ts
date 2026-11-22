// "ส่วนของฉัน" on the homepage for signed-in members. Everything that is stored
// stays in THIS browser (localStorage / sessionStorage), keyed by the member's id;
// nothing is written to the database. Pure helpers are unit-tested; the storage
// helpers never throw (private windows and blocked storage just return nothing).

import type { EntitlementSnapshot } from "./entitlement";
import { memberPlanIdForDisplay, isMembershipExpired, type MemberSubscription } from "./memberAccount";
import { planDisplayName } from "./planDisplay";

export const RECENT_LIMIT = 8;
export const SIGNED_IN_HINT_KEY = "kru:signed-in-hint:v1";
const RECENT_PREFIX = "kru:recent-resources:v1:";
const VISIT_PREFIX = "kru:last-visit:v1:";
const BASELINE_PREFIX = "kru:visit-baseline:v1:";
const ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// ----- recently used -----

export function parseRecentIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === "string" && ID.test(item)).map((item) => item.toLowerCase()))].slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** Newest first, no duplicates, at most RECENT_LIMIT. */
export function addRecentId(list: readonly string[], id: string): string[] {
  if (!ID.test(id)) return [...list].slice(0, RECENT_LIMIT);
  const lower = id.toLowerCase();
  return [lower, ...list.filter((item) => item !== lower)].slice(0, RECENT_LIMIT);
}

function store(kind: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readRecentIds(userId: string): string[] {
  try {
    return parseRecentIds(store("local")?.getItem(RECENT_PREFIX + userId));
  } catch {
    return [];
  }
}

export function recordRecentResource(userId: string, resourceId: string): void {
  try {
    const storage = store("local");
    if (!storage) return;
    storage.setItem(RECENT_PREFIX + userId, JSON.stringify(addRecentId(readRecentIds(userId), resourceId)));
  } catch {
    // Storage full or blocked: "recently used" is a convenience only.
  }
}

// ----- "new since your last visit" -----

/**
 * The time of the PREVIOUS visit, fixed for this browser tab session so a reload does
 * not make the "new" badges disappear. null = first visit on this device.
 */
export function visitBaseline(userId: string, now = Date.now()): number | null {
  try {
    const session = store("session");
    const local = store("local");
    const sessionKey = BASELINE_PREFIX + userId;
    const known = session?.getItem(sessionKey);
    if (known !== null && known !== undefined) {
      const parsed = Number(known);
      return known === "" || !Number.isFinite(parsed) ? null : parsed;
    }
    const previousRaw = local?.getItem(VISIT_PREFIX + userId);
    const previous = previousRaw ? Number(previousRaw) : null;
    const baseline = previous !== null && Number.isFinite(previous) ? previous : null;
    session?.setItem(sessionKey, baseline === null ? "" : String(baseline));
    local?.setItem(VISIT_PREFIX + userId, String(now));
    return baseline;
  } catch {
    return null;
  }
}

/** With a known previous visit: published after it. First visit (null): keep the normal "new this week" flag. */
export function isNewSince(publishedAt: string | null | undefined, baseline: number | null, fallbackIsNew: boolean): boolean {
  if (baseline === null) return fallbackIsNew;
  if (!publishedAt) return false;
  const time = Date.parse(publishedAt);
  return Number.isFinite(time) && time > baseline;
}

// ----- the sign-in hint (avoids a layout jump for returning members) -----

export function readSignedInHint(): boolean {
  try {
    return store("local")?.getItem(SIGNED_IN_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSignedInHint(signedIn: boolean): void {
  try {
    const storage = store("local");
    if (!storage) return;
    if (signedIn) storage.setItem(SIGNED_IN_HINT_KEY, "1");
    else storage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // ignore
  }
}

// ----- greeting and status -----

/** "นภา ใจดี" -> "นภา"; "ครูนภา" -> "นภา"; nothing usable -> null (never the e-mail address). */
export function teacherFirstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const name = first.replace(/^ครู/, "").trim();
  return name.length > 0 ? name.slice(0, 30) : null;
}

export function greetingText(fullName: string | null | undefined): string {
  const name = teacherFirstName(fullName);
  return name ? `สวัสดีค่ะ ครู${name} 👋` : "สวัสดีค่ะ คุณครู 👋";
}

export type ViewerKind = "free" | "pro" | "admin";

export interface ViewerStatus {
  kind: ViewerKind;
  /** Badge text. */
  label: string;
  /** Pro only: end of the current period, ISO, when the account already has it. */
  until: string | null;
}

export function summarizeViewer(input: {
  role: string | null | undefined;
  entitlements: EntitlementSnapshot | null;
  subscription: MemberSubscription | null;
}): ViewerStatus {
  const planId = memberPlanIdForDisplay(input.entitlements, input.subscription);
  const paid = planId !== null && planId !== "free";
  const subscription = input.subscription;
  const current = paid && subscription !== null && subscription.planId === planId && !isMembershipExpired(subscription);
  const until = current ? subscription.currentPeriodEnd : null;
  if (input.role === "admin" || input.role === "owner") return { kind: "admin", label: "แอดมิน", until };
  if (paid) return { kind: "pro", label: planDisplayName(planId, subscription?.planName ?? null), until };
  return { kind: "free", label: "สมาชิกฟรี", until: null };
}

export function formatThaiDay(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }) : null;
}
