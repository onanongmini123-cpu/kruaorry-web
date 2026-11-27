import { isResourceGrade } from "@/lib/resourceGrades";
import { isValidSlug } from "@/lib/resourceSlug";

// A login link may carry a destination, but never an arbitrary URL. Keeping
// this allowlist small prevents open redirects (only same-site paths of a few
// known shapes are ever returned). Sign-in may return to the back office
// ("/admin", optionally one "view"): that page checks the role itself and sends a
// non-admin to /app. Sign-UP never carries it (see authCompletionDestination).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BASE = "https://return-path.invalid";
const APP_VIEWS = new Set(["home", "library", "favorites", "plans", "requests"]);
const APP_FILTER_PARAMS = ["resource", "view", "q", "category", "grade"] as const;

// Where a signed-in member lands when nothing more specific was asked for: the
// same homepage everyone sees, with the member section (greeting, shortcuts,
// recently used). The member area (/app) stays one tap away.
export const MEMBER_HOME = "/";
export const SIGNUP_DESTINATION = MEMBER_HOME;
export const FREE_SIGNUP_HREF = "/login?mode=signup&next=%2Fapp";
export type AuthEntryMode = "signin" | "signup";

function hasOnlyParams(params: URLSearchParams, allowed: readonly string[]): boolean {
  const keys = [...params.keys()];
  return keys.every((key) => allowed.includes(key) && params.getAll(key).length === 1);
}

function internalUrl(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 700 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || CONTROL.test(raw)) {
    return null;
  }

  try {
    const url = new URL(raw, BASE);
    return url.origin === BASE && !url.hash ? url : null;
  } catch {
    return null;
  }
}

function safeAppPath(url: URL): string | null {
  if (url.pathname !== "/app" || !hasOnlyParams(url.searchParams, APP_FILTER_PARAMS)) return null;
  const resource = url.searchParams.get("resource");
  if (resource !== null && !UUID.test(resource)) return null;
  const view = url.searchParams.get("view");
  if (view !== null && !APP_VIEWS.has(view)) return null;
  const query = url.searchParams.get("q");
  if (query !== null && (!query.trim() || query.length > 100 || CONTROL.test(query))) return null;
  const category = url.searchParams.get("category");
  if (category !== null && (!category.trim() || category.length > 100 || CONTROL.test(category))) return null;
  const grade = url.searchParams.get("grade");
  if (grade !== null && !isResourceGrade(grade)) return null;
  return url.pathname + url.search;
}

const ADMIN_VIEW = /^[a-z][a-z0-9-]{0,39}$/;

/** "/admin" or "/admin?view=<name>". The admin page itself validates the view name. */
function safeAdminPath(url: URL): string | null {
  if (url.pathname !== "/admin" || !hasOnlyParams(url.searchParams, ["view"])) return null;
  const view = url.searchParams.get("view");
  if (view !== null && !ADMIN_VIEW.test(view)) return null;
  return url.pathname + url.search;
}

function safeResourceDetailPath(url: URL): string | null {
  const match = /^\/resources\/([^/]+)$/.exec(url.pathname);
  // A detail page is addressed by UUID (every older link) or by slug.
  return match && (UUID.test(match[1]) || isValidSlug(match[1])) && hasOnlyParams(url.searchParams, [])
    ? url.pathname
    : null;
}

/**
 * A membership CTA may remember only a member-app state or a public resource
 * detail. Keeping this narrower than the login allowlist prevents a crafted
 * `returnTo` from becoming an open redirect (or a loop back into membership).
 */
export function safeUpgradeReturnPath(raw: string | null | undefined): string {
  const url = internalUrl(raw);
  if (!url) return "/app";
  return safeAppPath(url) ?? safeResourceDetailPath(url) ?? "/app";
}

/**
 * The one paid-offer destination that may follow account creation: the
 * membership page itself, with only a plan and a safe `returnTo`. Anything else
 * (another path, extra parameters, an external URL) returns null.
 */
export function safeMembershipReturn(raw: string | null | undefined): string | null {
  const url = internalUrl(raw);
  if (!url || url.pathname !== "/membership") return null;
  if (!hasOnlyParams(url.searchParams, ["plan", "returnTo"])) return null;
  const plan = url.searchParams.get("plan");
  if (plan !== null && plan !== "founder" && plan !== "teacher") return null;
  const returnTo = url.searchParams.get("returnTo");
  if (returnTo !== null && safeUpgradeReturnPath(returnTo) !== returnTo) return null;
  return url.pathname + url.search;
}

/** Where the choice of plan is remembered between the sign-up form and the confirmed account. */
export const MEMBERSHIP_NEXT_METADATA_KEY = "membership_next";

export function safeAuthNext(raw: string | null | undefined): string {
  const url = internalUrl(raw);
  if (!url) return MEMBER_HOME;
  if (url.pathname === "/" && hasOnlyParams(url.searchParams, [])) return MEMBER_HOME;

  const appPath = safeAppPath(url);
  if (appPath) return appPath;

  const adminPath = safeAdminPath(url);
  if (adminPath) return adminPath;

  const resourcePath = safeResourceDetailPath(url);
  if (resourcePath) return resourcePath;

  try {
    const membershipPath = safeMembershipReturn(raw);
    if (membershipPath) return membershipPath;
    if (url.pathname === "/membership") return MEMBER_HOME;

    const match = /^\/download\/([^/]+)$/.exec(url.pathname);
    if (!match || !UUID.test(match[1]) || !hasOnlyParams(url.searchParams, ["name", "autoclose"])) {
      return MEMBER_HOME;
    }
    const name = url.searchParams.get("name");
    if (name !== null && (!name || name.length > 180 || CONTROL.test(name) || /[\\/]/.test(name))) return MEMBER_HOME;
    const autoClose = url.searchParams.get("autoclose");
    if (autoClose !== null && autoClose !== "1") return MEMBER_HOME;
    return url.pathname + url.search;
  } catch {
    return MEMBER_HOME;
  }
}

/**
 * Signup is a single-purpose account-creation flow: it never carries a
 * download, a resource deep link or any other offer through confirmation. The
 * one exception is the membership page (plan and safe returnTo only), so a
 * visitor who chose a plan comes back to it after creating the account. Sign-in
 * may retain the wider allowlist above because it resumes an action for an
 * existing account.
 */
export function authCompletionDestination(
  mode: AuthEntryMode,
  rawNext: string | null | undefined,
): string {
  return mode === "signup" ? safeMembershipReturn(rawNext) ?? SIGNUP_DESTINATION : safeAuthNext(rawNext);
}
