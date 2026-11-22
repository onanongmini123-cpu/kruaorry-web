// Homepage rankings (migration 060). The database answers with resource ids and
// counts only; this module validates that answer and turns it into rows of
// resources that exist in the public catalogue.

export const RANKING_ROW_LIMIT = 10;
/** A row with fewer items than this is hidden. */
export const RANKING_MIN_ITEMS = 3;

export interface HomepageRankings {
  hearts: string[];
  popular: string[];
  popularBasis: "30d" | "all_time";
  newest: string[];
  /** Heart count per resource id (absent = none). */
  heartCounts: Record<string, number>;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : null;
    if (typeof id === "string" && UUID.test(id)) seen.add(id.toLowerCase());
  }
  return [...seen].slice(0, RANKING_ROW_LIMIT);
}

export function parseHomepageRankings(value: unknown): HomepageRankings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const popular = row.popular && typeof row.popular === "object" ? row.popular as Record<string, unknown> : {};
  const heartCounts: Record<string, number> = {};
  if (row.heart_counts && typeof row.heart_counts === "object" && !Array.isArray(row.heart_counts)) {
    for (const [id, count] of Object.entries(row.heart_counts as Record<string, unknown>)) {
      if (UUID.test(id) && typeof count === "number" && Number.isInteger(count) && count > 0) heartCounts[id.toLowerCase()] = count;
    }
  }
  return {
    hearts: ids(row.hearts),
    popular: ids(popular.items),
    popularBasis: popular.basis === "30d" ? "30d" : "all_time",
    newest: ids(row.newest),
    heartCounts,
  };
}

export type RankingRowKey = "hearts" | "popular" | "newest";

export interface RankingRow<T> {
  key: RankingRowKey;
  title: string;
  items: T[];
}

/**
 * Builds the three rows from the catalogue the page already has. An id that is
 * not in the catalogue (unpublished meanwhile, cache lag) is skipped, and a row
 * with fewer than RANKING_MIN_ITEMS left is dropped, so nothing half-empty shows.
 */
export function buildRankingRows<T extends { id: string }>(rankings: HomepageRankings | null, catalogue: readonly T[]): RankingRow<T>[] {
  if (!rankings) return [];
  const byId = new Map(catalogue.map((item) => [item.id.toLowerCase(), item]));
  const pick = (list: string[]) => list.map((id) => byId.get(id)).filter((item): item is T => item !== undefined).slice(0, RANKING_ROW_LIMIT);
  const rows: RankingRow<T>[] = [
    { key: "newest", title: "🆕 ใหม่ล่าสุด", items: pick(rankings.newest) },
    { key: "popular", title: "🔥 ยอดนิยม", items: pick(rankings.popular) },
    { key: "hearts", title: "❤️ ครูกดหัวใจมากที่สุด", items: pick(rankings.hearts) },
  ];
  return rows.filter((row) => row.items.length >= RANKING_MIN_ITEMS);
}
