"use client";

import { useEffect } from "react";
import { LINE_OA_URL } from "@/lib/config";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="th">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>เกิดข้อผิดพลาดบางอย่าง</h1>
        <p style={{ marginTop: 8, color: "#666" }}>ขออภัยในความไม่สะดวก กรุณาลองใหม่อีกครั้ง</p>
        <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
          ถ้ายังไม่ได้ <a href={LINE_OA_URL} style={{ color: "#6d4fd6" }}>แจ้งปัญหา</a> ให้ทีมงานทางไลน์
        </p>
        <button
          onClick={reset}
          style={{ marginTop: 24, padding: "12px 24px", borderRadius: 999, border: "none", background: "#7d5cee", color: "#fff", fontSize: 16, cursor: "pointer" }}
        >
          ลองใหม่
        </button>
      </body>
    </html>
  );
}
