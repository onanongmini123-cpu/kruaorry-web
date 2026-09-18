import { isUsableResourceTarget, publicCoverUrl } from "@/lib/resourceVisibility";

export type PublicResource = {
  id: string;
  title: string;
  meta: string;
  description: string;
  category: string;
  deliveryMode: "web_app" | "google_template" | "google_form" | "file_download";
  coverImageUrl: string;
  tags: string[];
  isFree: boolean;
  fileName: string | null;
};

type Row = Record<string, unknown>;

const DELIVERY_MODES = new Set<PublicResource["deliveryMode"]>([
  "web_app", "google_template", "google_form", "file_download",
]);

// The starter SQL publishes three design fixtures with placeholder CTAs.
// They are not usable resources, so a public showcase must never advertise
// them or route a visitor toward a dead download/link. All other rows still
// require a real cover and a usable publish target.
export function toPublicResource(value: unknown): PublicResource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  if (row.status !== "published") return null;
  if (typeof row.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id)) return null;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  if (!DELIVERY_MODES.has(row.delivery_mode as PublicResource["deliveryMode"])) return null;
  const cover = publicCoverUrl(row.cover_image_url);
  if (!cover) return null;
  if (!isUsableResourceTarget({
    deliveryMode: row.delivery_mode as string,
    ctaUrl: typeof row.cta_url === "string" ? row.cta_url : null,
    filePath: typeof row.file_path === "string" ? row.file_path : null,
  })) return null;
  return {
    id: row.id,
    title: row.title.trim(),
    meta: typeof row.meta === "string" ? row.meta.trim() : "",
    description: typeof row.description === "string" ? row.description.trim() : "",
    category: typeof row.category === "string" ? row.category.trim() : "",
    deliveryMode: row.delivery_mode as PublicResource["deliveryMode"],
    coverImageUrl: cover,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 5) : [],
    isFree: row.is_free === true,
    fileName: typeof row.file_name === "string" ? row.file_name : null,
  };
}

export const PUBLIC_RESOURCE_SELECT = "id, title, meta, description, category, delivery_mode, cta_url, cover_image_url, tags, is_free, file_path, file_name, status";

export function signupHref(resource: PublicResource): string {
  const destination = resource.isFree && resource.deliveryMode === "file_download"
    ? `/download/${resource.id}`
    : `/app?resource=${resource.id}`;
  return `/login?next=${encodeURIComponent(destination)}&mode=signup`;
}
