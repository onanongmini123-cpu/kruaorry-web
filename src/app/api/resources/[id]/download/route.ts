import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/data";
import { withTimeout } from "@/lib/asyncTimeout";
import { redactSensitive } from "@/lib/redact";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

// Same-origin download route. This exists so the browser can call
// window.open() synchronously, inside the click handler, with a real URL —
// see src/lib/downloadWindow.ts for why that matters. All the async work
// (auth check, resource lookup, signed URL) happens here, server-side,
// using a Supabase client bound to the caller's own session cookies (never
// a service-role key), so RLS enforces publish status and plan entitlement
// exactly as it did when this was called directly from the browser.
//
// Every stage below is wrapped in withTimeout, which both bounds how long
// it can take and catches a thrown/rejected exception — so a stall or an
// error in *any* stage, not just the signed-URL call, still produces this
// route's Thai no-store error page instead of hanging the opened tab
// indefinitely or falling through to Next's generic error page.
// `Referrer-Policy: no-referrer` on every response (including the
// redirect) means the destination never learns this page's URL.
function errorPage(status: number, message: string): NextResponse {
  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ดาวน์โหลดไม่สำเร็จ — KruAorry</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #faf9fc; color: #1a1a1a; text-align: center; padding: 24px; }
  main { max-width: 360px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #666; font-size: 14px; line-height: 1.6; }
  a { color: #7c3aed; }
</style>
</head>
<body>
  <main>
    <h1>ดาวน์โหลดไม่สำเร็จ</h1>
    <p>${message}</p>
    <p><a href="/app">กลับไปที่แอป</a></p>
  </main>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", ...RESPONSE_HEADERS } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.error(`[download] failed to create the Supabase client: ${redactSensitive(message)}`);
    return errorPage(500, "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  }

  const authResult = await withTimeout(supabase.auth.getUser(), "auth.getUser");
  if (!authResult.ok) {
    console.error(`[download] ${authResult.reason}`);
    return errorPage(500, "ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  const { user } = authResult.value.data;
  if (!user) {
    return errorPage(401, "กรุณาเข้าสู่ระบบก่อนดาวน์โหลดไฟล์");
  }

  // RLS (resources_public_read_published) already restricts this to
  // published resources, or any resource at all for an admin — a draft,
  // archived, or nonexistent id all come back as no row here.
  const lookupResult = await withTimeout(Promise.resolve(supabase.from("resources").select("file_path, file_name").eq("id", id).single()), "resources lookup");
  if (!lookupResult.ok) {
    console.error(`[download] ${lookupResult.reason}`);
    return errorPage(500, "ตรวจสอบข้อมูลไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  const { data: resource, error: resourceError } = lookupResult.value;
  if (resourceError || !resource?.file_path) {
    console.error(`[download] resource lookup returned an error for id=${id}: ${redactSensitive(resourceError?.message ?? "no file_path")}`);
    return errorPage(404, "ไม่พบไฟล์นี้ หรือคุณไม่มีสิทธิ์เข้าถึง");
  }

  // A second, independent RLS check happens here too (storage.objects'
  // resource_files_entitled_read policy re-verifies published status and
  // plan entitlement) — so even if the resources-table check above were
  // ever loosened, an ineligible download still can't get a signed URL.
  // getSignedFileUrl is itself timeout-bounded and exception-safe, and
  // never returns or logs the signed URL/token, only a redacted reason.
  const { url, error } = await getSignedFileUrl(supabase, resource.file_path, resource.file_name);
  if (!url) {
    console.error(`[download] getSignedFileUrl failed for id=${id}: ${error}`);
    return errorPage(500, "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  return NextResponse.redirect(url, { status: 302, headers: RESPONSE_HEADERS });
}
