import Link from "next/link";
import { Heart, Lock } from "lucide-react";
import { Badge, Tag } from "./Badge";
import { PublicResourceCover } from "@/app/resources/PublicResourceCover";
import { ACCESS_TIER_LABEL, type AccessTier } from "@/lib/resourceAccess";
import { formatResourceGrades } from "@/lib/resourceGrades";
import { DELIVERY_TYPE_LABEL, parseResourceMeta, shortDescription } from "@/lib/resourceMeta";
import type { DeliveryMode } from "@/lib/resourceFile";
import "./ResourceCard.css";

export type ResourceAffordance = DeliveryMode;

const ACCESS_TIER_TONE: Record<AccessTier, "success" | "member" | "neutral"> = {
  free: "success",
  member: "success",
  pro: "member",
  unavailable: "neutral",
};

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
};

const BLURB_MAX_CHARS = 120;
const BLURB_FALLBACK = "ดูรายละเอียดและสิทธิ์การใช้งานของสื่อนี้";

export interface ResourceCardProps {
  title: string;
  /** Long or short description; the card only ever shows a two-line excerpt. */
  description?: string | null;
  /** Staff-written "·" separated facts line; only countable highlights are used. */
  meta?: string | null;
  /** Subject (วิชา). */
  category?: string | null;
  /** How the resource is delivered; drives the type tag and cover fallback. */
  deliveryMode: DeliveryMode;
  /** Structured grade levels: the only source for the grade tag. */
  gradeLevels?: readonly string[];
  /** Viewer-independent tier of the resource; the only input to the badge. */
  accessTier: AccessTier;
  /** Plans that unlock a Pro resource, announced to screen readers only. */
  requiredPlanNames?: readonly string[];
  coverImageUrl?: string | null;
  isNew?: boolean;
  /** The viewer cannot open it yet: adds a lock to the cover. Never changes the badge. */
  locked?: boolean;
  /** Detail page link (public pages). */
  href?: string;
  /** In-app detail (member app) when there is no page to link to. */
  onSelect?: () => void;
  saved?: boolean;
  savePending?: boolean;
  onSave?: () => void;
  /** Load the cover eagerly (first row above the fold). */
  priority?: boolean;
  /** Heading level of the title: 2 when the cards follow the page title directly, otherwise 3. */
  headingLevel?: 2 | 3;
}

const DETAIL_CTA = "ดูรายละเอียด";

export function ResourceCard({
  title,
  description,
  meta,
  category,
  deliveryMode,
  gradeLevels = [],
  accessTier,
  requiredPlanNames = [],
  coverImageUrl = null,
  isNew,
  locked,
  href,
  onSelect,
  saved,
  savePending,
  onSave,
  priority = false,
  headingLevel = 3,
}: ResourceCardProps) {
  const gradeText = formatResourceGrades(gradeLevels);
  const highlights = parseResourceMeta(meta).metrics.slice(0, 2);
  const blurb = shortDescription(description, BLURB_MAX_CHARS) || BLURB_FALLBACK;
  const planNames = accessTier === "pro" ? requiredPlanNames.filter(Boolean) : [];
  const Heading = headingLevel === 2 ? "h2" : "h3";

  const cover = (
    <>
      <PublicResourceCover
        title={title}
        url={coverImageUrl}
        deliveryMode={deliveryMode}
        eager={priority}
        style={{ aspectRatio: "16 / 10" }}
      />
      {locked && (
        <span className="kru-resource-card__lock" aria-hidden="true">
          <span><Lock size={18} /></span>
        </span>
      )}
    </>
  );

  return (
    <article className="kru-card kru-resource-card">
      <div className="kru-resource-card__media">
        {href ? (
          <Link href={href} className="kru-resource-card__cover" tabIndex={-1} aria-hidden="true">{cover}</Link>
        ) : (
          <button type="button" className="kru-resource-card__cover" tabIndex={-1} aria-hidden="true" onClick={onSelect}>{cover}</button>
        )}
        {onSave && (
          <button
            type="button"
            className="kru-resource-card__save"
            aria-label={saved ? "นำออกจากสื่อโปรด" : "เพิ่มเป็นสื่อโปรด"}
            aria-pressed={Boolean(saved)}
            aria-busy={savePending || undefined}
            // Not `disabled`: a focused button that becomes disabled drops keyboard
            // focus to the page, so the member would have to tab from the top again.
            aria-disabled={savePending || undefined}
            onClick={savePending ? undefined : onSave}
          >
            <Heart size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="kru-resource-card__body">
        <div className="kru-resource-card__badges">
          {isNew && <Badge tone="brand">ใหม่</Badge>}
          <Badge tone={ACCESS_TIER_TONE[accessTier]} icon={accessTier === "free" || accessTier === "member" ? undefined : Lock}>
            {ACCESS_TIER_LABEL[accessTier]}
            {planNames.length > 0 && <span style={VISUALLY_HIDDEN}> (ใช้ได้กับแพ็ก {planNames.join(" / ")})</span>}
          </Badge>
        </div>

        <Heading className="kru-resource-card__title">
          {href ? <Link href={href}>{title}</Link> : <button type="button" onClick={onSelect}>{title}</button>}
        </Heading>
        <p className="kru-resource-card__blurb">{blurb}</p>

        <div className="kru-resource-card__tags">
          {gradeText && <Tag>{gradeText}</Tag>}
          {category && <Tag>{category}</Tag>}
          <Tag>{DELIVERY_TYPE_LABEL[deliveryMode]}</Tag>
        </div>

        {highlights.length > 0 && <p className="kru-resource-card__highlights">{highlights.join(" · ")}</p>}

        {/* A second, visible way to the same page for pointer users. The title is
            the one link for keyboards and screen readers, so this is out of both. */}
        <div className="kru-resource-card__cta">
          {href ? (
            <Link href={href} className="kru-btn kru-btn--soft kru-btn--sm kru-btn--block" tabIndex={-1} aria-hidden="true">{DETAIL_CTA}</Link>
          ) : (
            <button type="button" className="kru-btn kru-btn--soft kru-btn--sm kru-btn--block" onClick={onSelect} tabIndex={-1} aria-hidden="true">{DETAIL_CTA}</button>
          )}
        </div>
      </div>
    </article>
  );
}
