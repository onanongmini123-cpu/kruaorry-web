import { publicCoverUrl } from "@/lib/resourceVisibility";

/**
 * Optional, structured teaching notes for a resource's detail page. Nothing
 * here is required: a section is only shown when its data exists, so a
 * resource with only a title and description still renders cleanly. The data
 * is expected as JSON (for example a nullable `detail_content` column) and is
 * validated and bounded here before it ever reaches the page.
 */
export interface ResourceDetailContent {
  audience: string | null;
  objectives: string[];
  contents: string[];
  classroomUse: string[];
  howToPlay: string[];
  estimatedMinutes: number | null;
  players: string | null;
  faq: { question: string; answer: string }[];
  previews: { url: string; caption: string | null }[];
}

const MAX_TEXT = 400;
const MAX_ITEMS = 12;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter((item): item is string => item !== null).slice(0, MAX_ITEMS);
}

export function parseDetailContent(value: unknown): ResourceDetailContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const faq = (Array.isArray(row.faq) ? row.faq : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const question = text((entry as Record<string, unknown>).question, 200);
      const answer = text((entry as Record<string, unknown>).answer, 600);
      return question && answer ? { question, answer } : null;
    })
    .filter((entry): entry is { question: string; answer: string } => entry !== null)
    .slice(0, 8);

  const previews = (Array.isArray(row.previews) ? row.previews : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const url = publicCoverUrl((entry as Record<string, unknown>).url);
      return url ? { url, caption: text((entry as Record<string, unknown>).caption, 160) } : null;
    })
    .filter((entry): entry is { url: string; caption: string | null } => entry !== null)
    .slice(0, 6);

  const minutes = typeof row.estimatedMinutes === "number" && Number.isFinite(row.estimatedMinutes)
    && row.estimatedMinutes >= 1 && row.estimatedMinutes <= 600
    ? Math.round(row.estimatedMinutes)
    : null;

  const content: ResourceDetailContent = {
    audience: text(row.audience),
    objectives: list(row.objectives),
    contents: list(row.contents),
    classroomUse: list(row.classroomUse),
    howToPlay: list(row.howToPlay),
    estimatedMinutes: minutes,
    players: text(row.players, 120),
    faq,
    previews,
  };
  return hasDetailContent(content) ? content : null;
}

export function hasDetailContent(content: ResourceDetailContent | null | undefined): boolean {
  if (!content) return false;
  return Boolean(
    content.audience || content.estimatedMinutes || content.players
    || content.objectives.length || content.contents.length || content.classroomUse.length
    || content.howToPlay.length || content.faq.length || content.previews.length,
  );
}
