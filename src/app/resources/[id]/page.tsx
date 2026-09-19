import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { loadPublicResource } from "../data";
import { signupHref } from "../catalog";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await loadPublicResource(id);
  if (!item) return { title: "ไม่พบสื่อ | KruAorry", robots: { index: false } };
  return { title: `${item.title} | KruAorry`, description: item.description || item.meta || "รายละเอียดสื่อการสอนสำหรับครูไทย" };
}

export default async function ResourceDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await loadPublicResource(id);
  if (!item) notFound();
  const actionLabel = item.isFree
    ? item.deliveryMode === "file_download" ? "สมัครฟรีแล้วดาวน์โหลด" : "สมัครฟรีแล้วเปิดใช้"
    : "สมัครเพื่อดูสิทธิ์สมาชิก";

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.coverImageUrl} alt={`ภาพปก ${item.title}`} referrerPolicy="no-referrer" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "var(--surface-sunken)" }} />
            <div style={{ padding: "var(--sp-4)", color: "var(--text-muted)", fontSize: "var(--fs-14)" }}>ภาพปกและรายละเอียดสำหรับพิจารณาก่อนสมัคร · ไฟล์จริงเปิดได้หลังเข้าสู่ระบบตามสิทธิ์</div>
          </div>
          <div>
            <span style={{ display: "inline-block", borderRadius: "var(--r-pill)", padding: "5px 12px", background: item.isFree ? "var(--status-success-bg)" : "var(--status-member-bg)", color: item.isFree ? "var(--status-success-fg)" : "var(--status-member-fg)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-14)" }}>{item.isFree ? "สื่อใช้งานฟรี" : "สื่อสำหรับสมาชิก"}</span>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, var(--fs-36))", lineHeight: "var(--lh-snug)", marginTop: "var(--sp-4)" }}>{item.title}</h1>
            {item.meta && <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>{item.meta}</p>}
            {item.category && <p style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-14)", color: "var(--text-body)" }}>หมวดหมู่: {item.category}</p>}
            {item.description && <p style={{ color: "var(--text-body)", fontSize: "var(--fs-18)", lineHeight: "var(--lh-loose)", marginTop: "var(--sp-6)", whiteSpace: "pre-wrap" }}>{item.description}</p>}
            {item.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "var(--sp-5)" }}>{item.tags.map((tag) => <span key={tag} style={{ padding: "4px 10px", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", color: "var(--text-body)", fontSize: "var(--fs-13)" }}>{tag}</span>)}</div>}
            <div className="kru-card" style={{ padding: "var(--sp-6)", marginTop: "var(--sp-7)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: "var(--fw-semibold)" }}><BookOpen size={20} />{item.isFree ? "เริ่มใช้สื่อนี้ฟรี" : "ตรวจสอบแพ็กที่เปิดใช้สื่อนี้ได้"}</div>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)", fontSize: "var(--fs-14)" }}>{item.isFree ? "สมัครบัญชีฟรีเพื่อเข้าใช้สื่อ โดยไม่ต้องเลือกแพ็กเสียเงิน" : "สมัครบัญชีฟรีก่อน แล้วดูรายละเอียดสิทธิ์และแพ็กเกจในแอป"}</p>
              <Link href={signupHref(item)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--brand)", color: "white", borderRadius: "var(--r-md)", padding: "12px 18px", minHeight: 46, fontWeight: "var(--fw-semibold)", marginTop: "var(--sp-5)" }}>{actionLabel}<ArrowRight size={18} /></Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
