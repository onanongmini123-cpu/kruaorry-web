"use client";

import { useState, type CSSProperties } from "react";
import { ClipboardCheck, FileDown, FileSpreadsheet, Gamepad2 } from "lucide-react";
import type { PublicResource } from "./catalog";

const ICONS = {
  web_app: Gamepad2,
  google_template: FileSpreadsheet,
  google_form: ClipboardCheck,
  file_download: FileDown,
} satisfies Record<PublicResource["deliveryMode"], typeof Gamepad2>;

interface PublicResourceCoverProps {
  title: string;
  url: string | null;
  deliveryMode: PublicResource["deliveryMode"];
  style?: CSSProperties;
  eager?: boolean;
}
export function PublicResourceCover({ title, url, deliveryMode, style, eager = false }: PublicResourceCoverProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = ICONS[deliveryMode];
  const showImage = Boolean(url) && failedUrl !== url;

  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        color: "var(--purple-700)",
        background: "linear-gradient(135deg, var(--purple-100), var(--pink-50), var(--blue-100))",
        ...style,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? undefined}
          alt={`ภาพปก ${title}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span role="img" aria-label={`ภาพประกอบ ${title}`}>
          <Icon size={42} strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
