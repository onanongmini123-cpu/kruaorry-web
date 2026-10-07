import type { DeliveryMode } from "@/lib/resourceFile";

export interface RelatedCandidate {
  id: string;
  title: string;
  category: string;
  tags: readonly string[];
  gradeLevels: readonly string[];
  deliveryMode: DeliveryMode;
  featuredRank: number | null;
}

const MAX_GRADE_POINTS = 3;
// Same subject, or at least one shared tag plus another signal. Grade and kind
// alone are too weak to call two resources related.
const MIN_RELATED_SCORE = 3;

function gradeOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.includes("all") || b.includes("all")) return 1;
  return Math.min(MAX_GRADE_POINTS, a.filter((grade) => b.includes(grade)).length);
}

/**
 * Nearby resources for a detail page: same subject first, then shared tags,
 * overlapping grades and the same kind of resource. Deterministic (ties break
 * on featured rank, then title) so the section never shuffles between renders,
 * and empty when nothing is genuinely related so the page can hide it.
 */
export function relatedResources<T extends RelatedCandidate>(target: T, all: readonly T[], limit = 6): T[] {
  const scored = all
    .filter((candidate) => candidate.id !== target.id)
    .map((candidate) => {
      let score = 0;
      if (target.category && candidate.category === target.category) score += 4;
      score += candidate.tags.filter((tag) => target.tags.includes(tag)).length * 2;
      score += gradeOverlap(target.gradeLevels, candidate.gradeLevels);
      if (candidate.deliveryMode === target.deliveryMode) score += 1;
      return { candidate, score };
    })
    // A shared delivery mode or grade alone is not "related".
    .filter(({ score }) => score >= MIN_RELATED_SCORE);

  scored.sort((a, b) => (
    b.score - a.score
    || (a.candidate.featuredRank ?? Number.MAX_SAFE_INTEGER) - (b.candidate.featuredRank ?? Number.MAX_SAFE_INTEGER)
    || a.candidate.title.localeCompare(b.candidate.title, "th")
  ));
  return scored.slice(0, Math.max(0, limit)).map(({ candidate }) => candidate);
}
