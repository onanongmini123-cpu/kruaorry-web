import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { PAYMENT_LINE_ID } from "@/lib/config";

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--sp-8) var(--sp-5)" }}>
      <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
        <Mascot size={32} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)" }}>KruAorry</span>
      </Link>
      <h1 style={{ marginTop: "var(--sp-7)", fontSize: "var(--fs-30)" }}>เงื่อนไขการใช้งาน</h1>
      <p style={{ marginTop: "var(--sp-3)", color: "var(--text-muted)" }}>ปรับปรุงล่าสุด: สิงหาคม 2569</p>

      <div style={{ marginTop: "var(--sp-7)", display: "grid", gap: "var(--sp-6)", fontSize: "var(--fs-16)", lineHeight: "var(--lh-loose)" }}>
        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>1. เกี่ยวกับบริการ</h2>
          <p>
            KruAorry เป็นบริการรวบรวมสื่อการสอน เทมเพลต Google และเครื่องมือในห้องเรียนสำหรับครูไทย
            สมัครสมาชิกได้ฟรี และมีแพ็กเกจแบบชำระเงินสำหรับปลดล็อกสื่อและเครื่องมือเพิ่มเติม
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>2. บัญชีผู้ใช้</h2>
          <p>
            คุณต้องให้ข้อมูลที่ถูกต้องเมื่อสมัครสมาชิก และรับผิดชอบในการรักษาความปลอดภัยของรหัสผ่านบัญชีของคุณ
            ห้ามแชร์บัญชีกับผู้อื่น
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>3. การชำระเงินและการอัปเกรดแพ็กเกจ</h2>
          <p>
            การอัปเกรดแพ็กเกจดำเนินการผ่านการติดต่อทีมงานโดยตรง (LINE: {PAYMENT_LINE_ID}) เพื่อโอนเงินหรือชำระเงินนอกระบบ
            ทีมงานจะอัปเกรดแพ็กเกจให้หลังจากยืนยันการชำระเงินแล้ว หากมีปัญหาเกี่ยวกับการชำระเงิน กรุณาติดต่อทีมงานผ่านช่องทางเดียวกัน
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>4. เนื้อหาและทรัพย์สินทางปัญญา</h2>
          <p>
            สื่อการสอนที่ให้บริการมีไว้สำหรับการใช้งานส่วนตัวและการสอนของครูผู้ใช้งานเท่านั้น
            ห้ามนำไปจำหน่ายต่อหรือเผยแพร่เพื่อการค้าโดยไม่ได้รับอนุญาต
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>5. การเปลี่ยนแปลงเงื่อนไข</h2>
          <p>ทีมงานอาจปรับปรุงเงื่อนไขการใช้งานนี้เป็นครั้งคราว การใช้งานต่อเนื่องถือว่ายอมรับเงื่อนไขที่ปรับปรุงแล้ว</p>
        </section>

        <section>
          <h2 style={{ fontSize: "var(--fs-20)", marginBottom: 8 }}>6. ติดต่อเรา</h2>
          <p>หากมีข้อสงสัยเกี่ยวกับเงื่อนไขการใช้งาน ติดต่อทีมงานผ่าน LINE: {PAYMENT_LINE_ID}</p>
        </section>
      </div>
    </div>
  );
}
