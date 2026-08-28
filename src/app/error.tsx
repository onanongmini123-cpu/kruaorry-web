"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error boundary caught:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--sp-5)", textAlign: "center" }}>
      <Mascot size={72} />
      <h1 style={{ marginTop: "var(--sp-6)", fontSize: "var(--fs-30)" }}>เกิดข้อผิดพลาดบางอย่าง</h1>
      <p style={{ marginTop: "var(--sp-3)", color: "var(--text-muted)", maxWidth: 420 }}>
        ขออภัยในความไม่สะดวก ลองใหม่อีกครั้ง หรือกลับหน้าแรก
      </p>
      <div style={{ marginTop: "var(--sp-7)", display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", justifyContent: "center" }}>
        <Button size="lg" onClick={reset}>
          ลองใหม่
        </Button>
        <Link href="/">
          <Button size="lg" variant="secondary">
            กลับหน้าแรก
          </Button>
        </Link>
      </div>
    </div>
  );
}
