// Watermarked preview images of Pro resources ("try before you buy", migration
// 059). These are public pictures only: nothing here can carry the real file
// or link of a resource.

export const MAX_RESOURCE_PREVIEWS = 6;
const PREVIEW_PATH = "/storage/v1/object/public/resource-covers/previews/";

/** True for an https image address inside the previews folder of the public cover bucket. */
export function isPreviewImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.startsWith(PREVIEW_PATH);
  } catch {
    return false;
  }
}

export interface PreviewRow {
  resource_id: string;
  position: number;
  image_url: string;
}

/** Groups catalogue rows by resource, ordered by position, validated and capped. */
export function groupPreviewRows(rows: unknown): Map<string, string[]> {
  const grouped = new Map<string, { position: number; url: string }[]>();
  if (!Array.isArray(rows)) return new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { resource_id: resourceId, position, image_url: url } = row as Record<string, unknown>;
    if (typeof resourceId !== "string" || typeof position !== "number" || !Number.isInteger(position) || position < 1) continue;
    if (!isPreviewImageUrl(url)) continue;
    const list = grouped.get(resourceId) ?? [];
    list.push({ position, url });
    grouped.set(resourceId, list);
  }
  return new Map([...grouped].map(([id, list]) => [
    id,
    list.sort((a, b) => a.position - b.position).slice(0, MAX_RESOURCE_PREVIEWS).map((entry) => entry.url),
  ]));
}
