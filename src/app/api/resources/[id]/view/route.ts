import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { isBotUserAgent, isPrefetchRequest, isViewerKey, newViewerKey, VIEWER_COOKIE, VIEWER_COOKIE_MAX_AGE_SECONDS } from "@/lib/viewTracking";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// Records one anonymous view of a published resource. It always answers 204 and
// never fails a page: counting is best effort. Admins, bots and prefetches are
// skipped BEFORE anything is stored or any cookie is issued. The database keeps
// at most one row per resource, anonymous viewer key and day (migration 060).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const done = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  const { id } = await params;
  if (!UUID.test(id)) return done();
  if (isBotUserAgent(request.headers.get("user-agent")) || isPrefetchRequest(request.headers)) return done();

  try {
    const supabase = await createClient();
    const auth = await withTimeout(supabase.auth.getUser(), "view auth");
    const user = auth.ok && !auth.value.error ? auth.value.data.user : null;
    if (isPermanentAuthUser(user)) {
      const profile = await withTimeout(Promise.resolve(supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()), "view role");
      const role = profile.ok && !profile.value.error ? (profile.value.data as { role?: unknown } | null)?.role : null;
      // Staff browsing their own site must not move the ranking. If the role cannot
      // be read, do not count (fail closed rather than count an admin).
      if (!profile.ok || profile.value.error || role === "admin" || role === "owner") return done();
    }

    const jar = await cookies();
    const existing = jar.get(VIEWER_COOKIE)?.value;
    const viewerKey = isViewerKey(existing) ? existing : newViewerKey();
    const rpc = await withTimeout(
      Promise.resolve(supabase.rpc("record_resource_view", { p_resource_id: id.toLowerCase(), p_viewer_key: viewerKey })),
      "record view",
    );
    const response = done();
    if (rpc.ok && !rpc.value.error && viewerKey !== existing) {
      response.cookies.set(VIEWER_COOKIE, viewerKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VIEWER_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch {
    return done();
  }
}
