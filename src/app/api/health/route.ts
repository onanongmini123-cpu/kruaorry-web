import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, unauthenticated health check for uptime monitors — reports both
// "the app process is up" (this route responding at all) and "the database
// is reachable" (a trivial read against a public table), so a monitor can
// tell those two failure modes apart instead of just "site down".
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: "error", db: "unconfigured" }, { status: 503 });
  }

  const supabase = createClient(url, key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const { error } = await supabase.from("plans").select("id").limit(1).abortSignal(controller.signal);
    clearTimeout(timeout);
    if (error) {
      return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok", db: "ok" }, { status: 200 });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
