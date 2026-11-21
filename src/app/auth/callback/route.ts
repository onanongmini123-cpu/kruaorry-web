import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEMBERSHIP_NEXT_METADATA_KEY, SIGNUP_DESTINATION, safeMembershipReturn } from "@/lib/authReturnPath";
import { isPermanentAuthUser } from "@/lib/authIdentity";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

// Supabase's SSR client uses the PKCE flow. The auth code (or a token hash
// from a customized confirmation template) must be exchanged on our origin
// so the resulting session is written to the same cookies read by /app and
// the download API. Never put an auth token into the post-login destination.

// The post-confirmation destination is /app, except that a visitor who chose a plan on
// /membership before signing up goes back there. The choice travels in the account's own
// metadata (written at sign-up), never in this URL, and is checked against the same
// membership-only allowlist before it is used: a tampered value falls back to /app.
function confirmedDestination(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): string {
  const remembered = user?.user_metadata?.[MEMBERSHIP_NEXT_METADATA_KEY];
  return (typeof remembered === "string" ? safeMembershipReturn(remembered) : null) ?? SIGNUP_DESTINATION;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const failure = new URL("/login", url.origin);
  failure.searchParams.set("next", SIGNUP_DESTINATION);
  failure.searchParams.set("error", "confirmation");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (url.searchParams.has("error") || Boolean(code) === Boolean(tokenHash)) {
    return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
  }

  try {
    const supabase = await createClient();
    let confirmedUser: { user_metadata?: Record<string, unknown> | null } | null = null;
    if (code) {
      const flowId = url.searchParams.get("sb_flow_id");
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error || !isPermanentAuthUser(data.user)) {
        return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
      }
      confirmedUser = data.user;
    } else {
      // Only the signup confirmation template's email token is accepted.
      // Recovery/invite tokens have their own routes and must not be used as
      // a shortcut to an arbitrary post-login resource.
      if (!tokenHash || url.searchParams.get("type") !== "email") {
        return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
      }
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (error || !isPermanentAuthUser(data.user)) {
        return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
      }
      confirmedUser = data.user;
    }

    return NextResponse.redirect(new URL(confirmedDestination(confirmedUser), url.origin), { headers: PRIVATE_HEADERS });
  } catch {
    // Never reflect provider errors or single-use codes into the URL or page.
    return NextResponse.redirect(failure, { headers: PRIVATE_HEADERS });
  }
}
