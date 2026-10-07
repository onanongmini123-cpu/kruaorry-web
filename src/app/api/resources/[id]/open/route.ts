import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isUsableResourceTarget } from "@/lib/resourceVisibility";
import { parseResourceTarget } from "@/lib/resourceTarget";
import { htmlErrorPage } from "@/lib/htmlErrorPage";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const HEADING = "เปิดสื่อไม่สำเร็จ";
const LIBRARY_ACTION = { href: "/resources", label: "ไปที่คลังสื่อ" };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return htmlErrorPage(404, HEADING, "ไม่พบสื่อนี้ หรือลิงก์ไม่ถูกต้อง", LIBRARY_ACTION);

  try {
    const client = await createClient();
    // The resolver is the authorization boundary. It permits an anonymous
    // caller only when the resource is explicitly marked public, and checks
    // the current plan/admin role for every other mode.
    const resolved = await withTimeout(
      Promise.resolve(client.rpc("resolve_resource_target", { p_resource_id: id }).maybeSingle()),
      "resource destination",
    );
    const target = resolved.ok ? parseResourceTarget(resolved.value.data) : null;
    if (!resolved.ok || resolved.value.error || !target) {
      // The resolver returns no row both for a signed-out visitor and for a
      // member without the required plan, so the detail page (which knows
      // the viewer) is the right next step: it offers login or upgrade.
      return htmlErrorPage(403, HEADING, "ต้องเข้าสู่ระบบหรือมีสิทธิ์ใช้งานก่อน จึงจะเปิดสื่อนี้ได้", { href: `/resources/${id}`, label: "ดูรายละเอียดและสิทธิ์การใช้งาน" });
    }
    if (target.delivery_mode === "file_download" || !isUsableResourceTarget({
      deliveryMode: target.delivery_mode,
      ctaUrl: target.cta_url,
      filePath: null,
    })) {
      return htmlErrorPage(404, HEADING, "สื่อนี้ยังไม่พร้อมใช้งานในขณะนี้", LIBRARY_ACTION);
    }

    // A relative URL is resolved on this origin. External destinations are
    // limited to http(s) by isUsableResourceTarget; no raw destination is
    // sent to the listing page or browser until authorization succeeds.
    const url = new URL(target.cta_url!, request.url);
    if (target.cta_url!.startsWith("/") && url.origin !== new URL(request.url).origin) {
      return htmlErrorPage(404, HEADING, "สื่อนี้ยังไม่พร้อมใช้งานในขณะนี้", LIBRARY_ACTION);
    }
    return NextResponse.redirect(url, { status: 302, headers: HEADERS });
  } catch {
    return htmlErrorPage(503, HEADING, "ไม่สามารถเปิดสื่อได้ในขณะนี้ กรุณาลองอีกครั้ง", { href: `/api/resources/${id}/open`, label: "ลองใหม่" });
  }
}
