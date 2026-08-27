import React from "react";
import type { LucideIcon } from "lucide-react";

interface StatTileProps {
  value: string | number;
  label: string;
  icon: LucideIcon;
  tone?: "brand" | "success" | "info" | "warning";
}

const toneStyles: Record<string, { bg: string; fg: string }> = {
  brand: { bg: "var(--brand-soft)", fg: "var(--text-link)" },
  success: { bg: "var(--status-success-bg)", fg: "var(--status-success-fg)" },
  info: { bg: "var(--status-info-bg)", fg: "var(--status-info-fg)" },
  warning: { bg: "var(--status-warning-bg)", fg: "var(--status-warning-fg)" },
};

export function StatTile({ value, label, icon: Icon, tone = "brand" }: StatTileProps) {
  const t = toneStyles[tone];
  return (
    <div className="kru-card" style={{ padding: "var(--sp-6)" }}>
      <span style={{ width: 40, height: 40, borderRadius: "var(--r-sm)", background: t.bg, color: t.fg, display: "grid", placeItems: "center" }}>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div
        style={{
          marginTop: "var(--sp-4)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-30)",
          fontWeight: "var(--fw-bold)",
          letterSpacing: "var(--ls-tight)",
          color: "var(--text-strong)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 4, fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
