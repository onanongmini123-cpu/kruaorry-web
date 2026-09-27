import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isAuthenticatedAccount } from "@/lib/authUser";
import {
  QUICK_RACE_PATH,
  QUICK_RACE_RESOURCE_ID,
  renderQuickRaceGame,
} from "@/server/quickRaceGame";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "private, no-store",
  "Vercel-CDN-Cache-Control": "private, no-store",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
} as const;

function loginRedirect(request: Request): Response {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", QUICK_RACE_PATH);
  return new Response(null, {
    status: 307,
    headers: { ...PRIVATE_HEADERS, Location: url.toString() },
  });
}

function plainResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function isExactQuickRaceTarget(target: unknown): target is {
  delivery_mode: "web_app";
  cta_url: string;
  file_path: null;
  file_name: null;
} {
  if (!target || typeof target !== "object") return false;
  const row = target as Record<string, unknown>;
  return row.delivery_mode === "web_app"
    && row.cta_url === QUICK_RACE_PATH
    && row.file_path === null
    && row.file_name === null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !isAuthenticatedAccount(user)) {
      return loginRedirect(request);
    }

    const { data: target, error: accessError } = await supabase.rpc(
      "resolve_resource_target",
      { p_resource_id: QUICK_RACE_RESOURCE_ID },
    ).maybeSingle();

    if (accessError || !isExactQuickRaceTarget(target)) {
      return plainResponse("ไม่มีสิทธิ์เข้าใช้เกมนี้", 403);
    }

    const nonce = randomBytes(18).toString("base64url");
    const html = await renderQuickRaceGame(nonce);
    const contentSecurityPolicy = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "style-src-attr 'none'",
      "img-src data:",
      "connect-src 'none'",
      "font-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; ");

    return new Response(html, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": contentSecurityPolicy,
      },
    });
  } catch {
    return plainResponse("ไม่สามารถเปิดเกมได้ในขณะนี้ กรุณาลองใหม่", 503);
  }
}
