"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="th">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>เกิดข้อผิดพลาดบางอย่าง</h1>
        <p style={{ marginTop: 8, color: "#666" }}>ขออภัยในความไม่สะดวก กรุณาลองใหม่อีกครั้ง</p>
        <button
          onClick={reset}
          style={{ marginTop: 24, padding: "12px 24px", borderRadius: 999, border: "none", background: "#8a6df0", color: "#fff", fontSize: 16, cursor: "pointer" }}
        >
          ลองใหม่
        </button>
      </body>
    </html>
  );
}
