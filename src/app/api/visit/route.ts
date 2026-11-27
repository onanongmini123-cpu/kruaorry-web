import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import {
  bangkokDate, isLikelyBot, isVisitorId, newVisitorId, viewerDayKey, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE,
} from "@/lib/siteVisit";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

// Approximate daily visitors for the owner's finance page (migration 065).
// Called by <SiteVisitBeacon /> once per Thai day after a page has loaded, so no page
// render (and no page cache) depends on it. It ALWAYS answers 204 with no body: a bot,
// a staff member, a missing setting or a database failure just means "not counted".
// Stored: only a daily HMAC key. Never the IP, e-mail, user id or user agent.
// The service-role key is read from the server environment here and nowhere else.
export async function POST(request: NextRequest) {
  const done = (visitorId?: string) => {
    const response = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
    if (visitorId) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }
    return response;
  };

  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return done();
    if (isLikelyBot(request.headers.get("user-agent"))) return done();
    const purpose = `${request.headers.get("sec-purpose") ?? ""} ${request.headers.get("purpose") ?? ""}`;
    if (/prefetch|prerender/i.test(purpose)) return done();

    const secret = process.env.VISIT_HASH_SECRET;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || !url || !serviceKey) return done();

    if (await isStaffOrUnknown(request)) return done();

    const existing = request.cookies.get(VISITOR_COOKIE)?.value;
    const visitorId = isVisitorId(existing) ? existing : newVisitorId();
    const key = viewerDayKey(secret, visitorId, bangkokDate());

    const service = createSupabaseClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await withTimeout(Promise.resolve(service.rpc("record_site_visit", { p_viewer_day_key: key })), "visit record", TIMEOUT_MS);
    return done(visitorId === existing ? undefined : visitorId);
  } catch {
    return done();
  }
}

// Admins and the owner are not counted. Only a request that carries a Supabase session
// cookie is looked up; if that lookup fails the visit is not counted (staff never slip in).
async function isStaffOrUnknown(request: NextRequest): Promise<boolean> {
  const signedIn = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
  if (!signedIn) return false;
  const supabase = await createClient();
  const auth = await withTimeout(supabase.auth.getUser(), "visit auth", TIMEOUT_MS);
  if (!auth.ok || auth.value.error) return true;
  const user = auth.value.data.user;
  if (!isPermanentAuthUser(user)) return false;
  const profile = await withTimeout(Promise.resolve(supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()), "visit role", TIMEOUT_MS);
  if (!profile.ok || profile.value.error) return true;
  const role = (profile.value.data as { role?: unknown } | null)?.role;
  return role === "admin" || role === "owner";
}
