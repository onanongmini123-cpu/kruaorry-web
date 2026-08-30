"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { triggerBlobDownload, shouldCloseTabAfterDownload, thaiDownloadErrorMessage } from "@/lib/triggerBlobDownload";

// This page only exists so the tab window.open() targets can close itself
// deterministically once the file is fully downloaded — see
// triggerBlobDownload.ts for why. It fetches the existing, unchanged
// /api/resources/[id]/download route (which still does all the auth,
// entitlement, and signing work server-side, and still redirects to the
// signed URL — fetch() just follows that redirect transparently) and
// buffers the response as a Blob before triggering the save.
export default function DownloadPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Read before this page nulls its own window.opener (reverse-tabnabbing
  // mitigation) — a tab the user navigated to directly (the same-tab
  // fallback when a popup is blocked) has no opener, and window.close()
  // on it would be refused by the browser anyway.
  const hadOpenerRef = useRef(typeof window !== "undefined" && window.opener != null);

  useEffect(() => {
    try {
      if (window.opener) window.opener = null;
    } catch {
      // Some browsers make `opener` non-configurable — nothing more to do.
    }

    let cancelled = false;
    const fileName = searchParams.get("name");

    triggerBlobDownload(`/api/resources/${params.id}/download`, fileName, {
      fetchImpl: (url, init) => fetch(url, init),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      createAnchor: () => document.createElement("a"),
      appendToBody: (el) => document.body.appendChild(el as unknown as HTMLAnchorElement),
      removeFromBody: (el) => (el as unknown as HTMLAnchorElement).remove(),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        setErrorMessage(thaiDownloadErrorMessage(result.status));
        return;
      }
      setStatus("done");
      if (shouldCloseTabAfterDownload(hadOpenerRef.current, result)) {
        window.close();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--sp-6)", textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        {status === "working" && <p style={{ color: "var(--text-muted)" }}>กำลังดาวน์โหลดไฟล์...</p>}
        {status === "error" && (
          <>
            <p style={{ color: "var(--status-danger-fg)" }}>{errorMessage}</p>
            <div style={{ marginTop: "var(--sp-4)", display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
              <button type="button" onClick={() => window.close()} style={{ border: "1px solid var(--border-subtle)", background: "transparent", borderRadius: "var(--r-md)", padding: "8px 16px", cursor: "pointer" }}>
                ปิดแท็บนี้
              </button>
              <a href="/app" style={{ color: "var(--brand)", alignSelf: "center" }}>
                กลับไปที่แอป
              </a>
            </div>
          </>
        )}
        {status === "done" && (
          // Only reachable when this tab couldn't close itself (opened
          // directly, not via window.open()) — the script-opened case
          // closes automatically and never renders this.
          <>
            <p>ดาวน์โหลดเสร็จแล้ว</p>
            <a href="/app" style={{ color: "var(--brand)" }}>
              กลับไปที่แอป
            </a>
          </>
        )}
      </div>
    </div>
  );
}
