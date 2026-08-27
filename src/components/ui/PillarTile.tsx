"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

interface PillarTileProps {
  icon: LucideIcon;
  tone?: "purple" | "pink" | "blue";
  title: string;
  description: string;
  onClick?: () => void;
}

const toneStyles: Record<string, { bg: string; fg: string }> = {
  purple: { bg: "var(--purple-100)", fg: "var(--purple-700)" },
  pink: { bg: "var(--pink-100)", fg: "var(--pink-700)" },
  blue: { bg: "var(--blue-100)", fg: "var(--blue-700)" },
};

export function PillarTile({ icon: Icon, tone = "purple", title, description, onClick }: PillarTileProps) {
  const t = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="kru-card"
      style={{ padding: "var(--sp-6)", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}
    >
      <span style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", background: t.bg, color: t.fg, display: "grid", placeItems: "center" }}>
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-18)", color: "var(--text-strong)" }}>{title}</div>
        <div style={{ marginTop: 4, fontSize: "var(--fs-14)", color: "var(--text-muted)", lineHeight: "var(--lh-normal)" }}>{description}</div>
      </div>
    </button>
  );
}
