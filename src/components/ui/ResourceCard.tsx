"use client";

import React, { useState } from "react";
import { Bookmark, Lock, type LucideIcon } from "lucide-react";
import { Badge } from "./Badge";
import { Tag } from "./Badge";
import { resourceGradeLabel } from "@/lib/resourceGrades";

export type ResourceAffordance = "web_app" | "google_template" | "google_form" | "file_download";

const AFFORDANCE_LABEL: Record<ResourceAffordance, string> = {
  web_app: "เปิดใช้งาน",
  google_template: "ทำสำเนาไปยัง Drive ของฉัน",
  google_form: "เปิดแบบฟอร์ม",
  file_download: "ดาวน์โหลดไฟล์",
};

const TINTS: Record<string, { bg: string; fg: string }> = {
  purple: { bg: "var(--purple-100)", fg: "var(--purple-700)" },
  pink: { bg: "var(--pink-100)", fg: "var(--pink-700)" },
  blue: { bg: "var(--blue-100)", fg: "var(--blue-700)" },
};

interface ResourceCardProps {
  title: string;
  meta: string;
  description?: string | null;
  affordance: ResourceAffordance;
  tags: string[];
  gradeLevels?: string[];
  requiredPlanNames?: string[];
  icon: LucideIcon;
  coverImageUrl?: string | null;
  tint?: "purple" | "pink" | "blue";
  locked?: boolean;
  free?: boolean;
  saved?: boolean;
  savePending?: boolean;
  onAction?: () => void;
  onSave?: () => void;
  onClick?: () => void;
}

export function ResourceCard({ title, meta, description, affordance, tags, gradeLevels = [], requiredPlanNames = [], icon: Icon, coverImageUrl, tint = "purple", locked, free, saved, savePending, onAction, onSave, onClick }: ResourceCardProps) {
  const t = TINTS[tint];
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const showCover = Boolean(coverImageUrl) && failedCoverUrl !== coverImageUrl;
  const accessLabel = locked && requiredPlanNames.length > 0
    ? `สำหรับ ${requiredPlanNames.join(" / ")}`
    : "สำหรับสมาชิก";

  return (
    <article className="kru-card kru-resource-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ position: "relative", height: 150, background: t.bg }}>
        <button
          type="button"
          aria-label={`ดูรายละเอียด ${title}`}
          onClick={onClick}
          style={{ border: "none", padding: 0, background: "transparent", width: "100%", height: "100%", position: "relative", cursor: "pointer", display: "grid", placeItems: "center", color: t.fg, overflow: "hidden" }}
        >
          {showCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl ?? undefined}
              alt={`ภาพปก ${title}`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedCoverUrl(coverImageUrl ?? null)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
          )}
          {locked && (
            <span style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", display: "grid", placeItems: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: "var(--r-pill)", background: "var(--status-member-bg)", color: "var(--status-member-fg)", display: "grid", placeItems: "center" }}>
                <Lock size={18} aria-hidden="true" />
              </span>
            </span>
          )}
        </button>
        {onSave && (
          <button
            type="button"
            aria-label={saved ? `นำ ${title} ออกจากรายการที่บันทึก` : `บันทึก ${title} ไว้ใช้ทีหลัง`}
            aria-pressed={Boolean(saved)}
            aria-busy={savePending || undefined}
            disabled={savePending}
            onClick={onSave}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 2,
              width: 32,
              height: 32,
              borderRadius: "var(--r-pill)",
              border: "1px solid rgba(255,255,255,0.78)",
              background: "rgba(255,255,255,0.9)",
              display: "grid",
              placeItems: "center",
              color: saved ? "var(--brand)" : "var(--text-muted)",
              cursor: savePending ? "wait" : "pointer",
              boxShadow: "var(--shadow-sm)",
              opacity: savePending ? 0.65 : 1,
            }}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        )}
      </div>
      <div style={{ padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "var(--sp-3)", flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {free ? <Badge tone="success">ฟรี</Badge> : <Badge tone="member" icon={Lock}>{accessLabel}</Badge>}
        </div>
        <button
          type="button"
          onClick={onClick}
          className="kru-resource-card__title"
          style={{ textAlign: "left", border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: "var(--fs-16)", fontWeight: "var(--fw-semibold)", color: "var(--text-strong)", lineHeight: "var(--lh-snug)" }}
        >
          {title}
        </button>
        <p className="kru-resource-card__description">{description?.trim() || "ดูรายละเอียดและตัวอย่างของสื่อนี้ก่อนเลือกใช้งาน"}</p>
        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
        {(gradeLevels.length > 0 || tags.length > 0) && (
          <div className="kru-resource-card__tags">
            {gradeLevels.slice(0, 2).map((grade) => (
              <Tag key={`grade-${grade}`}>{resourceGradeLabel(grade)}</Tag>
            ))}
            {tags.slice(0, Math.max(0, 3 - Math.min(gradeLevels.length, 2))).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        )}
        <div className="kru-resource-card__actions">
          <button type="button" onClick={onClick} className="kru-resource-card__more">ดูเพิ่มเติม</button>
          <button type="button" onClick={onAction} className="kru-btn kru-btn--soft kru-btn--sm">
            {locked ? "อัปเกรดเพื่อปลดล็อก" : AFFORDANCE_LABEL[affordance]}
          </button>
        </div>
      </div>
      <style>{`
        .kru-resource-card__title {
          min-height: 2.8em;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .kru-resource-card__description {
          min-height: 4.5em;
          color: var(--text-body);
          font-size: var(--fs-14);
          line-height: var(--lh-normal);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .kru-resource-card__tags {
          min-height: 28px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-content: flex-start;
        }
        .kru-resource-card__actions {
          margin-top: auto;
          padding-top: var(--sp-2);
          display: grid;
          gap: var(--sp-2);
        }
        .kru-resource-card__more {
          min-height: 32px;
          width: max-content;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--purple-700);
          font-size: var(--fs-14);
          font-weight: var(--fw-semibold);
          cursor: pointer;
        }
      `}</style>
    </article>
  );
}
