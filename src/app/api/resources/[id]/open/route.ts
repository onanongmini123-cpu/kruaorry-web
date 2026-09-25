import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isUsableResourceTarget } from "@/lib/resourceVisibility";
import { parseResourceTarget } from "@/lib/resourceTarget";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("ไม่พบสื่อนี้", { status: 404, headers: HEADERS });

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
      return new NextResponse("ไม่พบสื่อหรือไม่มีสิทธิ์เปิดสื่อนี้", { status: 403, headers: HEADERS });
    }
    if (target.delivery_mode === "file_download" || !isUsableResourceTarget({
      deliveryMode: target.delivery_mode,
      ctaUrl: target.cta_url,
      filePath: null,
    })) {
      return new NextResponse("ลิงก์สื่อนี้ไม่พร้อมใช้งาน", { status: 404, headers: HEADERS });
    }

    // A relative URL is resolved on this origin. External destinations are
    // limited to http(s) by isUsableResourceTarget; no raw destination is
    // sent to the listing page or browser until authorization succeeds.
    const url = new URL(target.cta_url!, request.url);
    if (target.cta_url!.startsWith("/") && url.origin !== new URL(request.url).origin) {
      return new NextResponse("ลิงก์สื่อนี้ไม่พร้อมใช้งาน", { status: 404, headers: HEADERS });
    }
    return NextResponse.redirect(url, { status: 302, headers: HEADERS });
  } catch {
    return new NextResponse("เปิดสื่อไม่สำเร็จ กรุณาลองใหม่", { status: 503, headers: HEADERS });
  }
}
