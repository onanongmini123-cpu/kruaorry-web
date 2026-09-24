import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Lock } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { resourceGradeLabel } from "@/lib/resourceGrades";
import { loadPublicResource, loadPublicResourceViewer } from "../data";
import { publicResourceAction, requiredPlansLabel } from "../catalog";
import { PublicResourceCover } from "../PublicResourceCover";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await loadPublicResource(id);
  if (!item) return { title: "ไม่พบสื่อ | KruAorry", robots: { index: false } };
  return { title: `${item.title} | KruAorry`, description: item.description || item.meta || "รายละเอียดสื่อการสอนสำหรับครูไทย" };
}

export default async function ResourceDetailPage({ params }: Props) {
  const { id } = await params;
  const [item, viewer] = await Promise.all([loadPublicResource(id), loadPublicResourceViewer()]);
  if (!item) notFound();
  const action = publicResourceAction(item, viewer);
  const planLabel = requiredPlansLabel(item);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page)" }}>
      <header style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-4) var(--sp-5)", display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--text-strong)", fontWeight: "var(--fw-bold)", fontFamily: "var(--font-display)" }}><Mascot size={34} /> KruAorry</Link>
          <div style={{ flex: 1 }} />
          <Link href="/resources" style={{ color: "var(--text-link)", fontWeight: "var(--fw-semibold)" }}>คลังสื่อ</Link>
        </div>
      </header>
      <main style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-8) var(--sp-5) var(--sp-13)" }}>
        <Link href="/resources" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-link)", marginBottom: "var(--sp-6)" }}><ArrowLeft size={17} />กลับไปคลังสื่อ</Link>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: "var(--sp-8)", alignItems: "start" }}>
          <div className="kru-card" style={{ overflow: "hidden" }}>
            <PublicResourceCover title={item.title} url={item.coverImageUrl} deliveryMode={item.deliveryMode} eager style={{ aspectRatio: "4 / 3" }} />
            <div style={{ padding: "var(--sp-4)", color: "var(--text-muted)", fontSize: "var(--fs-14)" }}>ภาพปกและรายละเอียดสำหรับพิจารณาก่อนสมัคร · ไฟล์จริงเปิดได้หลังเข้าสู่ระบบตามสิทธิ์</div>
          </div>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: "var(--r-pill)", padding: "5px 12px", background: item.isFree ? "var(--status-success-bg)" : "var(--status-member-bg)", color: item.isFree ? "var(--status-success-fg)" : "var(--status-member-fg)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-14)" }}>{!item.isFree && <Lock size={15} aria-hidden="true" />}{item.isFree ? "สื่อใช้งานฟรี" : `สำหรับ ${planLabel}`}</span>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, var(--fs-36))", lineHeight: "var(--lh-snug)", marginTop: "var(--sp-4)" }}>{item.title}</h1>
            {item.meta && <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>{item.meta}</p>}
            {item.category && <p style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-14)", color: "var(--text-body)" }}>หมวดหมู่: {item.category}</p>}
            {item.gradeLevels.length > 0 && <p style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-14)", color: "var(--text-body)" }}>ระดับชั้น: {item.gradeLevels.map(resourceGradeLabel).join(", ")}</p>}
            {item.description && <p style={{ color: "var(--text-body)", fontSize: "var(--fs-18)", lineHeight: "var(--lh-loose)", marginTop: "var(--sp-6)", whiteSpace: "pre-wrap" }}>{item.description}</p>}
            {item.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "var(--sp-5)" }}>{item.tags.map((tag) => <span key={tag} style={{ padding: "4px 10px", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", color: "var(--text-body)", fontSize: "var(--fs-13)" }}>{tag}</span>)}</div>}
            <div className="kru-card" style={{ padding: "var(--sp-6)", marginTop: "var(--sp-7)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: "var(--fw-semibold)" }}>{action.locked ? <Lock size={20} /> : <BookOpen size={20} />}{action.canUse ? "บัญชีของคุณเปิดใช้สื่อนี้ได้" : item.isFree ? "เริ่มใช้สื่อนี้ด้วยบัญชีฟรี" : `สื่อนี้ต้องใช้ ${planLabel}`}</div>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)", fontSize: "var(--fs-14)" }}>{action.canUse ? "ระบบจะตรวจสิทธิ์อีกครั้งที่เซิร์ฟเวอร์ก่อนเปิดสื่อหรือสร้างลิงก์ดาวน์โหลด" : item.isFree ? "สมัครบัญชีฟรีเพื่อเข้าใช้สื่อ โดยไม่ต้องเลือกแพ็กเสียเงิน" : "ดูรายละเอียดได้โดยไม่เปิดเผยไฟล์หรือลิงก์ปลายทาง อัปเกรดแพ็กเพื่อปลดล็อกการใช้งาน"}</p>
              <a
                href={action.href}
                target={action.opensNewTab ? "_blank" : undefined}
                rel={action.opensNewTab ? "noopener noreferrer" : undefined}
                referrerPolicy={action.opensNewTab ? "no-referrer" : undefined}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--brand)", color: "white", borderRadius: "var(--r-md)", padding: "12px 18px", minHeight: 46, fontWeight: "var(--fw-semibold)", marginTop: "var(--sp-5)" }}
              >
                {action.label}<ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
