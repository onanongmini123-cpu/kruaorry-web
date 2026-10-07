import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { LINE_OA_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--sp-8) var(--sp-5)" }}>
      <Link href="/" style={{ minHeight: "var(--tap-min)", display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
        <Mascot size={32} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)" }}>KruAorry</span>
      </Link>
      <h1 style={{ marginTop: "var(--sp-7)", fontSize: "var(--fs-30)" }}>นโยบายความเป็นส่วนตัว</h1>
      <p style={{ marginTop: "var(--sp-3)", color: "var(--text-muted)" }}>ปรับปรุงล่าสุด: ตุลาคม 2569</p>

      <div style={{ marginTop: "var(--sp-7)", display: "grid", gap: "var(--sp-6)", fontSize: "var(--fs-16)", lineHeight: "var(--lh-loose)" }}>
        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>ข้อมูลที่เราเก็บ</h2>
          <p>เมื่อสมัครสมาชิก เราเก็บอีเมลและชื่อของคุณ เพื่อใช้สร้างบัญชีและติดต่อกลับเกี่ยวกับบัญชีของคุณ</p>
          <p style={{ marginTop: 8 }}>
            เมื่อคุณใช้งานแอป เราเก็บข้อมูลการใช้งาน เช่น สื่อที่กดหัวใจไว้เป็นสื่อโปรด และคำขอที่คุณส่งในระบบ (ไอเดียสื่อใหม่ คำขออัปเกรดแพ็กเกจ)
            เพื่อให้ฟีเจอร์เหล่านี้ทำงานได้
          </p>
          <p style={{ marginTop: 8 }}>
            หากคุณเพิ่มรูปโปรไฟล์ รูปจะถูกเก็บแบบส่วนตัวและเปิดดูด้วยลิงก์ชั่วคราวเฉพาะบัญชีของคุณ หากคุณเขียนรีวิว เนื้อหาและคะแนนจะรอทีมงานตรวจสอบก่อนแสดงต่อสาธารณะโดยใช้ชื่อกลางว่า “สมาชิก KruAorry” โดยไม่แสดงชื่อ อีเมล หรือรูปโปรไฟล์ของคุณ ส่วนรายงานปัญหาจะแสดงเฉพาะทีมงานหลังบ้าน
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>การชำระเงิน</h2>
          <p>
            KruAorry ไม่เก็บข้อมูลบัตรเครดิต เลขบัญชีธนาคาร หรือไฟล์สลิปบนเว็บไซต์ หลักฐานการชำระส่งผ่าน <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">LINE Official Account</a> โดยตรงกับทีมงาน
          </p>
          <p style={{ marginTop: 8 }}>
            ในระบบสมาชิก เราเก็บเฉพาะเลขอ้างอิงใบสมัคร แพ็กที่สมัคร ยอดเงิน สถานะ วันเวลารับชำระ เลขอ้างอิงการชำระ และบันทึกว่าผู้ดูแลคนใดยืนยันรายการ เพื่อออกสิทธิ์สมาชิก ป้องกันการยืนยันซ้ำ และตรวจสอบย้อนหลัง
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>ผู้ให้บริการที่เราใช้</h2>
          <p>เราใช้ Supabase สำหรับจัดเก็บข้อมูลบัญชีและฐานข้อมูล และ Vercel สำหรับโฮสต์เว็บไซต์ ทั้งสองผู้ให้บริการมีมาตรการรักษาความปลอดภัยของตนเอง</p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>สิทธิ์ของคุณ</h2>
          <p>คุณสามารถขอแก้ไขหรือลบข้อมูลบัญชีของคุณได้โดยติดต่อทีมงานผ่าน <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">LINE Official Account</a></p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>ติดต่อเรา</h2>
          <p>หากมีข้อสงสัยเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ ติดต่อทีมงานผ่าน <a href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">LINE Official Account</a></p>
        </section>
      </div>
    </main>
  );
}
