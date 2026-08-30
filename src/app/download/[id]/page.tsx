"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { triggerBlobDownload, shouldCloseTabAfterDownload, thaiDownloadErrorMessage } from "@/lib/triggerBlobDownload";
import { AUTO_CLOSE_PARAM } from "@/lib/downloadWindow";

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
  // Whether this tab should try to close itself once the download finishes
  // — set from the AUTO_CLOSE_PARAM marker downloadWindow.ts adds only to
  // the popup URL (never the same-tab fallback URL), not from
  // window.opener: the parent tab already nulls this popup's window.opener
  // (see downloadWindow.ts) before this page's own JS ever runs, so by the
  // time any effect here could read it, it's always null — on every
  // successful popup open, not just the fallback path. Reading it as the
  // close signal made the auto-close path unreachable.
  const openedAsPopup = searchParams.get(AUTO_CLOSE_PARAM) === "1";

  useEffect(() => {
    // Reverse-tabnabbing mitigation, independent of the auto-close signal
    // above: sever this popup's own back-reference to the opener too.
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
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setStatus("error");
          setErrorMessage(thaiDownloadErrorMessage(result.status));
          return;
        }
        setStatus("done");
        if (shouldCloseTabAfterDownload(openedAsPopup, result)) {
          window.close();
        }
      })
      .catch((thrown) => {
        // triggerBlobDownload itself always resolves, never rejects — this
        // is a last-resort safety net so a bug there (or in one of the DOM
        // deps above) leaves the user an error to act on instead of a tab
        // stuck on "กำลังดาวน์โหลดไฟล์..." forever with an unhandled
        // rejection in the console.
        if (cancelled) return;
        console.error("[download] unexpected failure", thrown);
        setStatus("error");
        setErrorMessage(thaiDownloadErrorMessage(undefined));
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
          // Normally only reachable on the same-tab fallback path
          // (openedAsPopup false — window.close() is never attempted there)
          // — the popup path closes itself automatically and only falls
          // through to render this if the browser refuses window.close().
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
