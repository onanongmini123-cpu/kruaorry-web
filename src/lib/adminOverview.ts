import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyErrorMessage, GENERIC_LOAD_ERROR } from "@/lib/userMessages";

export const ADMIN_OVERVIEW_UNAVAILABLE_MESSAGE =
  "ข้อมูลธุรกิจเพิ่มเติมจะพร้อมหลังติดตั้งส่วนสรุปข้อมูล โดยเครื่องมือหลังบ้านเดิมยังใช้งานได้ตามปกติ";

export interface AdminOverviewRankedFavorite {
  title: string;
  heart_count: number;
}

export interface AdminOverviewRankedReview {
  title: string;
  average_rating: number;
  review_count: number;
}

export interface AdminOverviewContentRow {
  grade_level: string;
  category: string;
  resource_count: number;
}

export interface AdminOverviewInsights {
  as_of: string;
  timezone: "Asia/Bangkok";
  periods: {
    month_start: string;
    new_members_7_days_start: string;
    new_members_30_days_start: string;
  };
  revenue: {
    month_confirmed_thb: number;
    all_time_confirmed_thb: number;
    first_confirmed_at: string | null;
    refunds_supported: false;
  };
  premium_memberships: {
    active_count: number;
    expiring_within_30_days_count: number;
  };
  new_members: {
    last_7_days_count: number;
    last_30_days_count: number;
  };
  founder_seats: {
    used: number;
    capacity: number;
  };
  application_funnel: {
    total_members: number;
    requested_premium: number;
    approved_premium: number;
  };
  favorites: {
    top_published_resources: AdminOverviewRankedFavorite[];
    published_without_hearts_count: number;
  };
  reviews: {
    minimum_review_count: number;
    top_published_resources: AdminOverviewRankedReview[];
  };
  content_breakdown: AdminOverviewContentRow[];
}

export interface AdminOverviewLoadResult {
  data: AdminOverviewInsights | null;
  message: string | null;
  unavailable: boolean;
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const recordAt = (value: UnknownRecord, key: string): UnknownRecord | null => isRecord(value[key]) ? value[key] : null;
const nonnegativeNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
);
const nonnegativeInteger = (value: unknown): number | null => {
  const parsed = nonnegativeNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};
const validTimestamp = (value: unknown): string | null => (
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
);
const nonemptyText = (value: unknown): string | null => (
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null
);

function rankedFavorites(value: unknown): AdminOverviewRankedFavorite[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const result: AdminOverviewRankedFavorite[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const title = nonemptyText(item.title);
    const heartCount = nonnegativeInteger(item.heart_count);
    if (!title || heartCount === null) return null;
    result.push({ title, heart_count: heartCount });
  }
  return result;
}

function rankedReviews(value: unknown): AdminOverviewRankedReview[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const result: AdminOverviewRankedReview[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const title = nonemptyText(item.title);
    const averageRating = nonnegativeNumber(item.average_rating);
    const reviewCount = nonnegativeInteger(item.review_count);
    if (!title || averageRating === null || reviewCount === null || averageRating > 5) return null;
    result.push({ title, average_rating: averageRating, review_count: reviewCount });
  }
  return result;
}

function contentRows(value: unknown): AdminOverviewContentRow[] | null {
  if (!Array.isArray(value)) return null;
  const result: AdminOverviewContentRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const gradeLevel = nonemptyText(item.grade_level);
    const category = nonemptyText(item.category);
    const resourceCount = nonnegativeInteger(item.resource_count);
    if (!gradeLevel || !category || resourceCount === null) return null;
    result.push({ grade_level: gradeLevel, category, resource_count: resourceCount });
  }
  return result;
}

/** Reject malformed RPC data instead of silently turning an unknown value into a business metric. */
export function normalizeAdminOverviewInsights(value: unknown): AdminOverviewInsights | null {
  if (!isRecord(value) || value.timezone !== "Asia/Bangkok") return null;
  const periods = recordAt(value, "periods");
  const revenue = recordAt(value, "revenue");
  const premium = recordAt(value, "premium_memberships");
  const members = recordAt(value, "new_members");
  const founder = recordAt(value, "founder_seats");
  const funnel = recordAt(value, "application_funnel");
  const favorites = recordAt(value, "favorites");
  const reviews = recordAt(value, "reviews");
  if (!periods || !revenue || !premium || !members || !founder || !funnel || !favorites || !reviews) return null;

  const asOf = validTimestamp(value.as_of);
  const monthStart = validTimestamp(periods.month_start);
  const sevenStart = validTimestamp(periods.new_members_7_days_start);
  const thirtyStart = validTimestamp(periods.new_members_30_days_start);
  const firstConfirmed = revenue.first_confirmed_at === null ? null : validTimestamp(revenue.first_confirmed_at);
  const monthRevenue = nonnegativeInteger(revenue.month_confirmed_thb);
  const allRevenue = nonnegativeInteger(revenue.all_time_confirmed_thb);
  const active = nonnegativeInteger(premium.active_count);
  const expiring = nonnegativeInteger(premium.expiring_within_30_days_count);
  const sevenMembers = nonnegativeInteger(members.last_7_days_count);
  const thirtyMembers = nonnegativeInteger(members.last_30_days_count);
  const founderUsed = nonnegativeInteger(founder.used);
  const founderCapacity = nonnegativeInteger(founder.capacity);
  const totalMembers = nonnegativeInteger(funnel.total_members);
  const requested = nonnegativeInteger(funnel.requested_premium);
  const approved = nonnegativeInteger(funnel.approved_premium);
  const topFavorites = rankedFavorites(favorites.top_published_resources);
  const withoutHearts = nonnegativeInteger(favorites.published_without_hearts_count);
  const minimumReviews = nonnegativeInteger(reviews.minimum_review_count);
  const topReviews = rankedReviews(reviews.top_published_resources);
  const breakdown = contentRows(value.content_breakdown);

  if (!asOf || !monthStart || !sevenStart || !thirtyStart
    || (revenue.first_confirmed_at !== null && !firstConfirmed)
    || monthRevenue === null || allRevenue === null || revenue.refunds_supported !== false
    || active === null || expiring === null || sevenMembers === null || thirtyMembers === null
    || founderUsed === null || founderCapacity === null || totalMembers === null
    || requested === null || approved === null || !topFavorites || withoutHearts === null
    || minimumReviews === null || !topReviews || !breakdown) return null;

  return {
    as_of: asOf,
    timezone: "Asia/Bangkok",
    periods: { month_start: monthStart, new_members_7_days_start: sevenStart, new_members_30_days_start: thirtyStart },
    revenue: {
      month_confirmed_thb: monthRevenue,
      all_time_confirmed_thb: allRevenue,
      first_confirmed_at: firstConfirmed,
      refunds_supported: false,
    },
    premium_memberships: { active_count: active, expiring_within_30_days_count: expiring },
    new_members: { last_7_days_count: sevenMembers, last_30_days_count: thirtyMembers },
    founder_seats: { used: founderUsed, capacity: founderCapacity },
    application_funnel: { total_members: totalMembers, requested_premium: requested, approved_premium: approved },
    favorites: { top_published_resources: topFavorites, published_without_hearts_count: withoutHearts },
    reviews: { minimum_review_count: minimumReviews, top_published_resources: topReviews },
    content_breakdown: breakdown,
  };
}

function isMissingOverviewRpc(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return /^(?:PGRST202|42883)$/.test(code)
    || /get_admin_overview_insights.*(?:schema cache|does not exist|could not find)/i.test(message);
}

export async function fetchAdminOverviewInsights(supabase: SupabaseClient): Promise<AdminOverviewLoadResult> {
  try {
    const { data, error } = await supabase.rpc("get_admin_overview_insights");
    if (error) {
      if (isMissingOverviewRpc(error)) {
        return { data: null, message: ADMIN_OVERVIEW_UNAVAILABLE_MESSAGE, unavailable: true };
      }
      return { data: null, message: friendlyErrorMessage(error, GENERIC_LOAD_ERROR), unavailable: false };
    }
    const normalized = normalizeAdminOverviewInsights(data);
    if (!normalized) return { data: null, message: GENERIC_LOAD_ERROR, unavailable: false };
    return { data: normalized, message: null, unavailable: false };
  } catch (error) {
    return { data: null, message: friendlyErrorMessage(error, GENERIC_LOAD_ERROR), unavailable: false };
  }
}
