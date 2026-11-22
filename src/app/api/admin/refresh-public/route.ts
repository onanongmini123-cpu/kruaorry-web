import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store" };

// Called by the admin console right after an admin saves something the public
// pages show (homepage videos, a resource's video, preview pictures, the
// resource itself). It marks the cached public data stale so the next visit
// shows the change instead of waiting for the 5 minute timers. Staff only,
// same site only, and it changes no data: it only clears caches.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ ok: false }, { status: 403, headers: HEADERS });
  }
  try {
    const supabase = await createClient();
    const auth = await withTimeout(supabase.auth.getUser(), "refresh auth");
    const user = auth.ok && !auth.value.error ? auth.value.data.user : null;
    if (!isPermanentAuthUser(user)) return NextResponse.json({ ok: false }, { status: 401, headers: HEADERS });
    const profile = await withTimeout(Promise.resolve(supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()), "refresh role");
    const role = profile.ok && !profile.value.error ? (profile.value.data as { role?: unknown } | null)?.role : null;
    if (role !== "admin" && role !== "owner") return NextResponse.json({ ok: false }, { status: 403, headers: HEADERS });

    // { expire: 0 }: no stale copy is served, the next visit reads fresh data.
    revalidateTag("landing", { expire: 0 });
    revalidateTag("catalog", { expire: 0 });
    revalidatePath("/");
    revalidatePath("/resources");
    revalidatePath("/resources/[key]", "page");
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: HEADERS });
  }
}
