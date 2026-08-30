import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/data";

export const dynamic = "force-dynamic";

// Same-origin download route. This exists so the browser can call
// window.open() synchronously, inside the click handler, with a real URL —
// see src/lib/downloadWindow.ts for why that matters. All the async work
// (auth check, resource lookup, signed URL) happens here, server-side,
// using a Supabase client bound to the caller's own session cookies (never
// a service-role key), so RLS enforces publish status and plan entitlement
// exactly as it did when this was called directly from the browser. On any
// failure this returns a small Thai-language HTML page instead of hanging
// or leaving a blank tab — the caller never has to guess what happened.
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
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorPage(401, "กรุณาเข้าสู่ระบบก่อนดาวน์โหลดไฟล์");
  }

  // RLS (resources_public_read_published) already restricts this to
  // published resources, or any resource at all for an admin — a draft,
  // archived, or nonexistent id all come back as no row here.
  const { data: resource, error: resourceError } = await supabase.from("resources").select("file_path, file_name").eq("id", id).single();

  if (resourceError || !resource?.file_path) {
    console.error(`[download] resource lookup failed for id=${id}: ${resourceError?.message ?? "no file_path"}`);
    return errorPage(404, "ไม่พบไฟล์นี้ หรือคุณไม่มีสิทธิ์เข้าถึง");
  }

  // A second, independent RLS check happens here too (storage.objects'
  // resource_files_entitled_read policy re-verifies published status and
  // plan entitlement) — so even if the resources-table check above were
  // ever loosened, an ineligible download still can't get a signed URL.
  const { url, error } = await getSignedFileUrl(supabase, resource.file_path, resource.file_name);
  if (!url) {
    console.error(`[download] getSignedFileUrl failed for id=${id}: ${error}`);
    return errorPage(500, "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
}
