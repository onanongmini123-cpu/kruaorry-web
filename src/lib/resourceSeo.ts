import { formatResourceGrades } from "@/lib/resourceGrades";
import { DELIVERY_TYPE_LABEL, shortDescription } from "@/lib/resourceMeta";
import { absoluteUrl, SITE_NAME } from "@/lib/site";
import type { DeliveryMode } from "@/lib/resourceFile";

interface SeoResource {
  title: string;
  category: string;
  description: string;
  meta: string;
  gradeLevels: readonly string[];
  deliveryMode: DeliveryMode;
  coverImageUrl: string | null;
  accessMode: "public" | "authenticated" | "plans" | "locked";
}

// The site name is appended by the layout's title template, so this budget is
// for the part before it. Roughly what a search result shows on one line.
const TITLE_BUDGET = 56;

/**
 * "ชื่อ · วิชา · ระดับชั้น", dropping the grade and then the subject when the
 * line would be too long, so a title is never padded with keywords.
 */
export function resourceSeoTitle(resource: Pick<SeoResource, "title" | "category" | "gradeLevels">): string {
  const grades = formatResourceGrades(resource.gradeLevels);
  const candidates = [
    [resource.title, resource.category, grades],
    [resource.title, resource.category],
    [resource.title],
  ].map((parts) => parts.filter(Boolean).join(" · "));
  return candidates.find((candidate) => candidate.length <= TITLE_BUDGET) ?? resource.title;
}

export function resourceSeoDescription(resource: Pick<SeoResource, "description" | "meta" | "category" | "gradeLevels" | "deliveryMode">): string {
  const body = shortDescription(resource.description || resource.meta, 155);
  if (body) return body;
  const grades = formatResourceGrades(resource.gradeLevels);
  const parts = [DELIVERY_TYPE_LABEL[resource.deliveryMode], resource.category, grades].filter(Boolean);
  return `${parts.join(" · ")} สำหรับครูไทย บน ${SITE_NAME}`;
}

/** Structured data for a detail page. Only facts the page already shows. */
export function resourceJsonLd(resource: SeoResource, canonicalPath: string): Record<string, unknown> {
  const grades = formatResourceGrades(resource.gradeLevels);
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: resource.title,
    description: resourceSeoDescription(resource),
    url: absoluteUrl(canonicalPath),
    inLanguage: "th",
    learningResourceType: DELIVERY_TYPE_LABEL[resource.deliveryMode],
    ...(grades ? { educationalLevel: grades } : {}),
    ...(resource.category ? { about: resource.category } : {}),
    ...(resource.coverImageUrl ? { image: resource.coverImageUrl } : {}),
    isAccessibleForFree: resource.accessMode === "public",
    provider: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
  };
}

export function breadcrumbJsonLd(resourceTitle: string, canonicalPath: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "คลังสื่อ", item: absoluteUrl("/resources") },
      { "@type": "ListItem", position: 3, name: resourceTitle, item: absoluteUrl(canonicalPath) },
    ],
  };
}

/** JSON for a <script type="application/ld+json"> without any way to close the tag early. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface FaqEntry { question: string; answer: string }

const ACCESS_ANSWER: Record<SeoResource["accessMode"], string> = {
  public: "ใช้ได้ฟรีทันที ไม่ต้องสมัครสมาชิก",
  authenticated: "ใช้ได้ฟรี เพียงสมัครสมาชิกฟรีกับ KruAorry ก่อน",
  plans: "เป็นสื่อสำหรับสมาชิก Teacher Pro ดูรายละเอียดและภาพตัวอย่างได้ก่อนสมัคร",
  locked: "สื่อนี้ยังไม่เปิดให้ใช้งาน",
};

/**
 * Short questions and answers built only from facts the page already shows
 * (grade, subject, type, access). Used when a resource has no hand-written FAQ,
 * so every detail page answers the questions teachers (and AI assistants) ask.
 */
export function resourceAutoFaq(resource: Pick<SeoResource, "title" | "category" | "gradeLevels" | "deliveryMode" | "accessMode" | "meta">): FaqEntry[] {
  const grades = formatResourceGrades(resource.gradeLevels);
  const type = DELIVERY_TYPE_LABEL[resource.deliveryMode];
  const subject = resource.category.replace(/^วิชา/, "").trim();
  const faq: FaqEntry[] = [];
  if (grades) {
    faq.push({ question: `${resource.title} เหมาะกับชั้นไหน`, answer: `เหมาะกับนักเรียนระดับ ${grades}${subject ? ` หมวด${subject}` : ""}` });
  }
  faq.push({ question: `${resource.title} ใช้ฟรีไหม`, answer: ACCESS_ANSWER[resource.accessMode] });
  const meta = resource.meta.trim();
  faq.push({
    question: `${resource.title} เป็นสื่อแบบไหน`,
    answer: `เป็น${type}${subject ? ` หมวด${subject}` : ""} จาก ${SITE_NAME}${meta ? ` (${meta})` : ""}`,
  });
  return faq;
}

export function faqJsonLd(entries: readonly FaqEntry[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}
