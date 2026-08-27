"use client";

import React from "react";
import { Bookmark, Lock, type LucideIcon } from "lucide-react";
import { Badge } from "./Badge";
import { Tag } from "./Badge";

export type ResourceAffordance = "web_app" | "google_template" | "google_form";

const AFFORDANCE_LABEL: Record<ResourceAffordance, string> = {
  web_app: "เปิดใช้งาน",
  google_template: "ทำสำเนาไปยัง Drive ของฉัน",
  google_form: "เปิดแบบฟอร์ม",
};

const TINTS: Record<string, { bg: string; fg: string }> = {
  purple: { bg: "var(--purple-100)", fg: "var(--purple-700)" },
  pink: { bg: "var(--pink-100)", fg: "var(--pink-700)" },
  blue: { bg: "var(--blue-100)", fg: "var(--blue-700)" },
};

interface ResourceCardProps {
  title: string;
  meta: string;
  affordance: ResourceAffordance;
  tags: string[];
  icon: LucideIcon;
  tint?: "purple" | "pink" | "blue";
  locked?: boolean;
  free?: boolean;
  saved?: boolean;
  onAction?: () => void;
  onSave?: () => void;
  onClick?: () => void;
}

export function ResourceCard({ title, meta, affordance, tags, icon: Icon, tint = "purple", locked, free, saved, onAction, onSave, onClick }: ResourceCardProps) {
  const t = TINTS[tint];
  return (
    <div className="kru-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={onClick}
        style={{ border: "none", padding: 0, background: t.bg, height: 150, position: "relative", cursor: "pointer", display: "grid", placeItems: "center", color: t.fg }}
      >
        <Icon size={32} strokeWidth={1.5} />
        {locked && (
          <span style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", display: "grid", placeItems: "center" }}>
            <span style={{ width: 40, height: 40, borderRadius: "var(--r-pill)", background: "var(--status-member-bg)", color: "var(--status-member-fg)", display: "grid", placeItems: "center" }}>
              <Lock size={18} />
            </span>
          </span>
        )}
        {onSave && (
          <span
            role="button"
            aria-label="บันทึกไว้ใช้ทีหลัง"
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 32,
              height: 32,
              borderRadius: "var(--r-pill)",
              background: "rgba(255,255,255,0.9)",
              display: "grid",
              placeItems: "center",
              color: saved ? "var(--brand)" : "var(--text-muted)",
            }}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          </span>
        )}
      </button>
      <div style={{ padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "var(--sp-3)", flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {free ? <Badge tone="success">ฟรี</Badge> : <Badge tone="member" icon={Lock}>สำหรับสมาชิก</Badge>}
        </div>
        <button
          type="button"
          onClick={onClick}
          style={{ textAlign: "left", border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: "var(--fs-16)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)", lineHeight: "var(--lh-snug)" }}
        >
          {title}
        </button>
        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tags.slice(0, 3).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        )}
        <button type="button" onClick={onAction} className="kru-btn kru-btn--soft kru-btn--sm" style={{ marginTop: "auto" }}>
          {AFFORDANCE_LABEL[affordance]}
        </button>
      </div>
    </div>
  );
}
