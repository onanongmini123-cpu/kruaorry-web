import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--sp-5)", textAlign: "center" }}>
      <Mascot size={72} />
      <h1 style={{ marginTop: "var(--sp-6)", fontSize: "var(--fs-30)" }}>ไม่พบหน้านี้</h1>
      <p style={{ marginTop: "var(--sp-3)", color: "var(--text-muted)", maxWidth: 420 }}>
        หน้าที่คุณกำลังหาอาจถูกย้ายหรือไม่มีอยู่จริง
      </p>
      <Link href="/" style={{ marginTop: "var(--sp-7)" }}>
        <Button size="lg">กลับหน้าแรก</Button>
      </Link>
    </div>
  );
}
