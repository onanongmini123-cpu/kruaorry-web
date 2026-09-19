import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/authReturnPath";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

// Supabase's SSR client uses the PKCE flow. The auth code (or a token hash
// from a customized confirmation template) must be exchanged on our origin
// so the resulting session is written to the same cookies read by /app and
// the download API. Never put an auth token into the post-login destination.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeAuthNext(url.searchParams.get("next"));
  const failure = new URL("/login", url.origin);
  failure.searchParams.set("next", next);
  failure.searchParams.set("error", "confirmation");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (url.searchParams.has("error") || Boolean(code) === Boolean(tokenHash)) {
    return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
  }

  try {
    const supabase = await createClient();
    if (code) {
      const flowId = url.searchParams.get("sb_flow_id");
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error || !data.user) return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
    } else {
      // Only the signup confirmation template's email token is accepted.
      // Recovery/invite tokens have their own routes and must not be used as
      // a shortcut to an arbitrary post-login resource.
      if (!tokenHash || url.searchParams.get("type") !== "email") {
        return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
      }
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (error || !data.user) return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
    }

    return NextResponse.redirect(new URL(next, url.origin), { headers: PRIVATE_HEADERS });
  } catch {
    // Never reflect provider errors or single-use codes into the URL or page.
    return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
  }
}
