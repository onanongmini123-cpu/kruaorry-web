import type { DeliveryMode } from "@/lib/resourceFile";

/** What kind of thing a resource is, in customer words (from how it is delivered). */
export const DELIVERY_TYPE_LABEL: Record<DeliveryMode, string> = {
  web_app: "เกมและสื่อออนไลน์",
  google_template: "เทมเพลต Google",
  google_form: "แบบฟอร์ม Google",
  file_download: "ไฟล์ดาวน์โหลด",
};

/** Library filter values for the "ประเภท" filter; stable, URL-friendly. */
export type ResourceTypeFilter = "all" | "online" | "template" | "form" | "file";

export const RESOURCE_TYPE_OPTIONS: ReadonlyArray<{ value: ResourceTypeFilter; label: string }> = [
  { value: "all", label: "ทุกประเภท" },
  { value: "online", label: DELIVERY_TYPE_LABEL.web_app },
  { value: "template", label: DELIVERY_TYPE_LABEL.google_template },
  { value: "form", label: DELIVERY_TYPE_LABEL.google_form },
  { value: "file", label: DELIVERY_TYPE_LABEL.file_download },
];

const TYPE_BY_DELIVERY: Record<DeliveryMode, Exclude<ResourceTypeFilter, "all">> = {
  web_app: "online",
  google_template: "template",
  google_form: "form",
  file_download: "file",
};

export function resourceTypeOf(mode: DeliveryMode): Exclude<ResourceTypeFilter, "all"> {
  return TYPE_BY_DELIVERY[mode];
}

export function isResourceTypeFilter(value: string): value is ResourceTypeFilter {
  return RESOURCE_TYPE_OPTIONS.some((option) => option.value === value);
}

const WORD_SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter("th", { granularity: "word" })
  : null;

/**
 * A card-sized blurb from a long description: whitespace collapsed and cut at
 * a word boundary (Thai has no spaces, so a plain slice can split a word or a
 * vowel mark) with an ellipsis. Never longer than `max` visible characters.
 */
export function shortDescription(text: string | null | undefined, max = 140): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let end = 0;
  if (WORD_SEGMENTER) {
    for (const part of WORD_SEGMENTER.segment(clean)) {
      const next = part.index + part.segment.length;
      if (next > max) break;
      end = next;
    }
  }
  if (end < max * 0.6) end = Array.from(clean).slice(0, max).join("").length;
  return `${clean.slice(0, end).trimEnd()}…`;
}

export interface ParsedResourceMeta {
  /** Content-size facts such as "810 ประโยค" or "48 คำ". */
  metrics: string[];
  /** How it is played or used, such as "เดี่ยว/2 คน/2–4 ทีม". */
  playModes: string | null;
}

const GRADE_SEGMENT = /^(?:อนุบาล|ป\.|ม\.|ทุกระดับ|ประถม|มัธยม)/;
// A play-mode segment is made only of mode words and head-counts, so a
// descriptor such as "เว็บเกมทีม" (which merely contains "ทีม") is not one.
const PLAY_MODE_TOKEN = /เดี่ยว|คู่|เพื่อน|ทั้งห้อง|และ|\d+(?:[–-]\d+)?\s*(?:คน|ทีม)/g;
function isPlayModeSegment(segment: string): boolean {
  return PLAY_MODE_TOKEN.test(segment) && segment.replace(PLAY_MODE_TOKEN, "").replace(/[\s/,+]/g, "") === "";
}
const METRIC_SEGMENT = /^\d[\d,.]*(?:[–-]\d[\d,.]*)?\s*\S/;

/**
 * Staff write a resource's `meta` as a "·"-separated line, e.g.
 * "เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · เดี่ยว/2 คน · ป.2–ม.3".
 * Until a structured highlights field exists this pulls the countable facts
 * out for cards and detail pages. Grade text is deliberately dropped: grades
 * come only from the structured `grade_levels`, so the two can never disagree.
 */
export function parseResourceMeta(meta: string | null | undefined): ParsedResourceMeta {
  const segments = (meta ?? "")
    .split(/\s*[·•]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const metrics: string[] = [];
  let playModes: string | null = null;
  for (const segment of segments) {
    if (GRADE_SEGMENT.test(segment)) continue;
    PLAY_MODE_TOKEN.lastIndex = 0;
    const playMode = isPlayModeSegment(segment);
    PLAY_MODE_TOKEN.lastIndex = 0;
    if (playMode) {
      if (!playModes) playModes = segment;
      continue;
    }
    if (METRIC_SEGMENT.test(segment) && segment.length <= 24) metrics.push(segment);
  }
  return { metrics, playModes };
}
