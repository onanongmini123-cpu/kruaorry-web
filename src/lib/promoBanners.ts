// Homepage promo banners (migration 061). Pure helpers: reading, validating and
// preparing banners. The database enforces the same rules; this keeps a bad row
// or a bad admin entry from ever reaching a page.

export const PROMO_BANNER_LIMIT = 6;
const BANNER_PATH = "/storage/v1/object/public/resource-covers/banners/";

export interface PromoBanner {
  imageUrl: string;
  imageMobileUrl: string | null;
  /** Null = the slide is a picture only. */
  linkUrl: string | null;
  altText: string;
}

/** A site path ("/resources") or an https address. Never javascript:, data:, http: or "//host". */
export function isSafeBannerLink(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  if (/[\s\\]/.test(value)) return false;
  if (value.startsWith("/")) return /^\/[A-Za-z0-9]/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** True for an https picture inside the banners folder of the public cover bucket. */
export function isBannerImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.startsWith(BANNER_PATH) && url.pathname.length > BANNER_PATH.length;
  } catch {
    return false;
  }
}

export function bannerLinkTarget(link: string): { href: string; external: boolean } {
  return { href: link, external: !link.startsWith("/") };
}

/** Validates the rows the database returned (already limited to on + in-window by RLS). */
export function parsePromoBanners(rows: unknown): PromoBanner[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row): { position: number; banner: PromoBanner } | null => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      if (typeof r.position !== "number" || !Number.isInteger(r.position) || r.position < 1) return null;
      if (!isBannerImageUrl(r.image_url)) return null;
      const alt = typeof r.alt_text === "string" ? r.alt_text.replace(/\s+/g, " ").trim().slice(0, 160) : "";
      if (!alt) return null;
      return {
        position: r.position,
        banner: {
          imageUrl: r.image_url,
          imageMobileUrl: isBannerImageUrl(r.image_mobile_url) ? r.image_mobile_url : null,
          linkUrl: isSafeBannerLink(r.link_url) ? r.link_url : null,
          altText: alt,
        },
      };
    })
    .filter((entry): entry is { position: number; banner: PromoBanner } => entry !== null)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.banner)
    .slice(0, PROMO_BANNER_LIMIT);
}

export interface BannerDraft {
  imageUrl: string;
  imageMobileUrl: string;
  linkUrl: string;
  altText: string;
  isActive: boolean;
  /** "YYYY-MM-DD" or "". */
  startDate: string;
  endDate: string;
}

export const EMPTY_BANNER_DRAFT: BannerDraft = { imageUrl: "", imageMobileUrl: "", linkUrl: "", altText: "", isActive: true, startDate: "", endDate: "" };

export interface BannerRpcItem {
  imageUrl: string;
  imageMobileUrl?: string;
  linkUrl?: string;
  altText: string;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Bangkok midnight of a "YYYY-MM-DD" day, as an ISO instant. */
function bangkokStart(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

/**
 * What to send to admin_set_promo_banners, or the first problem found, in Thai.
 * The end date is the LAST day the banner shows (it ends at the end of that day).
 */
export function bannersPayload(drafts: readonly BannerDraft[]): { ok: true; banners: BannerRpcItem[] } | { ok: false; message: string } {
  if (drafts.length > PROMO_BANNER_LIMIT) return { ok: false, message: `ใส่ได้สูงสุด ${PROMO_BANNER_LIMIT} แบนเนอร์` };
  const banners: BannerRpcItem[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const d = drafts[index];
    const name = `แบนเนอร์ที่ ${index + 1}`;
    if (!isBannerImageUrl(d.imageUrl.trim())) return { ok: false, message: `${name}: ยังไม่ได้ใส่รูปสำหรับคอม` };
    if (d.imageMobileUrl.trim() && !isBannerImageUrl(d.imageMobileUrl.trim())) return { ok: false, message: `${name}: รูปมือถือไม่ถูกต้อง` };
    const link = d.linkUrl.trim();
    if (link && !isSafeBannerLink(link)) return { ok: false, message: `${name}: ลิงก์ต้องขึ้นต้นด้วย https:// หรือ / (เช่น /resources) เท่านั้น` };
    const alt = d.altText.replace(/\s+/g, " ").trim();
    if (!alt) return { ok: false, message: `${name}: ใส่ข้อความ alt อธิบายรูป (สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ)` };
    if (alt.length > 160) return { ok: false, message: `${name}: ข้อความ alt ยาวเกิน 160 ตัวอักษร` };
    if (d.startDate && !DATE.test(d.startDate)) return { ok: false, message: `${name}: วันเริ่มไม่ถูกต้อง` };
    if (d.endDate && !DATE.test(d.endDate)) return { ok: false, message: `${name}: วันสิ้นสุดไม่ถูกต้อง` };
    if (d.startDate && d.endDate && d.endDate < d.startDate) return { ok: false, message: `${name}: วันสิ้นสุดต้องไม่ก่อนวันเริ่ม` };
    const item: BannerRpcItem = { imageUrl: d.imageUrl.trim(), altText: alt, isActive: d.isActive };
    if (d.imageMobileUrl.trim()) item.imageMobileUrl = d.imageMobileUrl.trim();
    if (link) item.linkUrl = link;
    if (d.startDate) item.startsAt = bangkokStart(d.startDate);
    if (d.endDate) {
      const next = new Date(`${d.endDate}T00:00:00+07:00`);
      next.setUTCDate(next.getUTCDate() + 1);
      item.endsAt = next.toISOString();
    }
    banners.push(item);
  }
  return { ok: true, banners };
}

/** Admin-side rows -> editable drafts (the admin may see switched-off and out-of-window rows). */
export function draftsFromRows(rows: unknown): BannerDraft[] {
  if (!Array.isArray(rows)) return [];
  const day = (value: unknown, endOfWindow: boolean): string => {
    if (typeof value !== "string") return "";
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return "";
    if (endOfWindow) at.setUTCDate(at.getUTCDate() - 1);
    return new Date(at.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  };
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, PROMO_BANNER_LIMIT)
    .map((r) => ({
      imageUrl: typeof r.image_url === "string" ? r.image_url : "",
      imageMobileUrl: typeof r.image_mobile_url === "string" ? r.image_mobile_url : "",
      linkUrl: typeof r.link_url === "string" ? r.link_url : "",
      altText: typeof r.alt_text === "string" ? r.alt_text : "",
      isActive: r.is_active !== false,
      startDate: day(r.starts_at, false),
      endDate: day(r.ends_at, true),
    }));
}
