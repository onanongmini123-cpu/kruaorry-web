import { Sparkles, FileSpreadsheet, Gamepad2, ClipboardCheck, FileDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceAffordance } from "@/components/ui";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/asyncTimeout";
import { redactSensitive } from "@/lib/redact";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot, type ResourceAccessMode } from "@/lib/entitlement";
import { normalizeFounderCapacity, type FounderCapacity } from "@/lib/founderCapacity";

function logError(label: string, error: PostgrestError) {
  console.error(`${label}: ${error.message} (code=${error.code}, details=${error.details}, hint=${error.hint})`);
}

export interface Resource {
  id: string;
  title: string;
  meta: string;
  description: string | null;
  category: string | null;
  affordance: ResourceAffordance;
  coverImageUrl: string | null;
  tags: string[];
  gradeLevels: string[];
  accessMode: ResourceAccessMode;
  requiredPlanIds: string[];
  requiredPlanNames: string[];
  free: boolean;
  isNew: boolean;
  fileSize: number | null;
  featuredRank: number | null;
  reviewAverage: number | null;
  reviewCount: number;
}

interface ResourceCatalogRow {
  id: string;
  title: string;
  meta: string | null;
  description: string | null;
  category: string | null;
  delivery_mode: string;
  cover_image_url: string | null;
  tags: string[] | null;
  grade_levels: string[] | null;
  access_mode: ResourceAccessMode;
  required_plan_ids: string[] | null;
  required_plan_names: string[] | null;
  is_free: boolean;
  is_new: boolean;
  file_size: number | null;
  featured_rank: number | null;
  review_average: number | string | null;
  review_count: number | string | null;
}

export interface PlanBenefit {
  featureId: string;
  name: string;
  description: string | null;
  valueType: "boolean" | "integer";
  limitValue: number | null;
}

export interface Plan {
  id: string;
  name: string;
  priceLabel: string;
  note: string | null;
  features: string[];
  benefits: PlanBenefit[];
  billingInterval: "month" | "year" | "lifetime" | null;
  isPopular: boolean;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: "member" | "admin" | "owner";
  plan: string;
  avatarPath: string | null;
}

const ICON_BY_MODE: Record<ResourceAffordance, LucideIcon> = {
  web_app: Gamepad2,
  google_template: FileSpreadsheet,
  google_form: ClipboardCheck,
  file_download: FileDown,
};

const TINT_BY_MODE: Record<ResourceAffordance, "purple" | "pink" | "blue"> = {
  web_app: "pink",
  google_template: "blue",
  google_form: "purple",
  file_download: "blue",
};

const RESOURCE_ACCESS_MODES = new Set<ResourceAccessMode>(["public", "authenticated", "plans", "locked"]);

function resourceAccessMode(value: unknown): ResourceAccessMode {
  return RESOURCE_ACCESS_MODES.has(value as ResourceAccessMode) ? value as ResourceAccessMode : "locked";
}

export function resourceIcon(affordance: ResourceAffordance): LucideIcon {
  return ICON_BY_MODE[affordance] ?? Sparkles;
}

export function resourceTint(affordance: ResourceAffordance): "purple" | "pink" | "blue" {
  return TINT_BY_MODE[affordance] ?? "purple";
}

export async function fetchPublishedResources(supabase: SupabaseClient): Promise<Resource[]> {
  const pageSize = 500;
  const rows: ResourceCatalogRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("resource_catalog")
      .select("id, title, meta, description, category, delivery_mode, cover_image_url, tags, grade_levels, access_mode, required_plan_ids, required_plan_names, is_free, is_new, file_size, featured_rank, review_average, review_count")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)), "published resource listing");

    if (!outcome.ok) {
      console.error(`fetchPublishedResources failed: ${outcome.reason}`);
      return [];
    }
    const { data, error } = outcome.value;
    if (error) logError("fetchPublishedResources failed", error);
    if (error || !data) return [];
    rows.push(...data as ResourceCatalogRow[]);
    if (data.length < pageSize) break;
  }

  return rows.map((r) => {
    const accessMode = resourceAccessMode(r.access_mode);
    return {
      id: r.id,
      title: r.title,
      meta: r.meta ?? "",
      description: r.description,
      category: r.category,
      affordance: r.delivery_mode as ResourceAffordance,
      coverImageUrl: r.cover_image_url,
      tags: r.tags ?? [],
      gradeLevels: r.grade_levels ?? [],
      accessMode,
      requiredPlanIds: r.required_plan_ids ?? [],
      requiredPlanNames: r.required_plan_names ?? [],
      free: accessMode === "public" || accessMode === "authenticated",
      isNew: r.is_new === true,
      fileSize: r.file_size,
      featuredRank: typeof r.featured_rank === "number" ? r.featured_rank : null,
      reviewAverage: r.review_average === null ? null : Number(r.review_average),
      reviewCount: Number(r.review_count ?? 0),
    };
  });
}

const RESOURCE_FILES_BUCKET = "resource-files";

export interface SignedFileUrlResult {
  url: string | null;
  error: string | null;
}

// Generates a short-lived signed URL for a private resource file. RLS on
// storage.objects enforces publish status + plan entitlement server-side;
// this only succeeds if the caller is actually allowed to read the object.
// `download` sets Content-Disposition: attachment on Supabase's response,
// so navigating to the URL downloads the file instead of rendering it.
//
// Called from the /api/resources/[id]/download route handler (server-side,
// with a per-request client bound to the caller's own session — RLS still
// applies exactly as it would client-side, no service-role key involved).
// Previously this was called directly from the browser before navigating a
// pre-opened blank tab; that pattern turned out to be unreliable (an async
// gap between window.open() and setting its location gets treated as an
// untrusted navigation by some browsers, and a hang here left the blank tab
// stuck forever with no feedback) — see the route handler for the fix.
//
// Never throws (withTimeout bounds and catches the underlying call), and
// never logs or returns the resulting signed URL itself, or any part of an
// underlying error that might embed it — only the input path and a
// redacted, generic error description (see redact.ts).
export async function getSignedFileUrl(supabase: SupabaseClient, filePath: string, fileName?: string | null, expiresInSeconds = 60): Promise<SignedFileUrlResult> {
  const result = await withTimeout(supabase.storage.from(RESOURCE_FILES_BUCKET).createSignedUrl(filePath, expiresInSeconds, { download: fileName || true }), "createSignedUrl");

  if (!result.ok) {
    console.error(`getSignedFileUrl failed for path=${filePath}: ${result.reason}`);
    return { url: null, error: result.reason };
  }
  const { data, error } = result.value;
  if (error || !data) {
    const message = redactSensitive(error?.message ?? "no data returned");
    console.error(`getSignedFileUrl failed for path=${filePath}: ${message}`);
    return { url: null, error: message };
  }
  return { url: data.signedUrl, error: null };
}

export async function fetchPlans(supabase: SupabaseClient): Promise<Plan[]> {
  const [planOutcome, benefitOutcome] = await Promise.all([
    withTimeout(Promise.resolve(supabase
      .from("plans")
      .select("id, name, price_label, note, is_popular, billing_interval")
      .eq("is_public", true)
      .eq("lifecycle_status", "active")
      .order("sort_order", { ascending: true })), "public plan listing"),
    withTimeout(Promise.resolve(supabase
      .from("plan_benefit_catalog")
      .select("plan_id, feature_id, feature_name, feature_description, value_type, limit_value, sort_order")
      .order("sort_order", { ascending: true })
      .order("feature_id", { ascending: true })), "plan benefit listing"),
  ]);

  if (!planOutcome.ok) {
    console.error(`fetchPlans failed: ${planOutcome.reason}`);
    return [];
  }
  const { data, error } = planOutcome.value;

  if (error) logError("fetchPlans failed", error);
  if (error || !data) return [];

  const benefitRows = benefitOutcome.ok && !benefitOutcome.value.error
    ? benefitOutcome.value.data ?? []
    : [];
  if (!benefitOutcome.ok) console.error(`fetchPlans benefits failed: ${benefitOutcome.reason}`);
  else if (benefitOutcome.value.error) logError("fetchPlans benefits failed", benefitOutcome.value.error);

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    priceLabel: p.price_label,
    note: p.note,
    benefits: benefitRows
      .filter((benefit) => benefit.plan_id === p.id)
      .map((benefit) => ({
        featureId: benefit.feature_id,
        name: benefit.feature_name,
        description: benefit.feature_description,
        valueType: benefit.value_type as PlanBenefit["valueType"],
        limitValue: benefit.limit_value === null ? null : Number(benefit.limit_value),
      })),
    features: benefitRows
      .filter((benefit) => benefit.plan_id === p.id)
      .map((benefit) => benefit.feature_name),
    billingInterval: p.billing_interval === "year"
      ? "year"
      : p.billing_interval === "one_time"
        ? "lifetime"
        : p.billing_interval === "month"
          ? "month"
          : null,
    isPopular: p.is_popular ?? false,
  }));
}

export async function fetchFounderCapacity(supabase: SupabaseClient): Promise<FounderCapacity | null> {
  const outcome = await withTimeout(Promise.resolve(supabase.rpc("get_founder_capacity")), "Founder capacity");
  if (!outcome.ok) {
    console.error(`fetchFounderCapacity failed: ${outcome.reason}`);
    return null;
  }

  const { data, error } = outcome.value;
  if (error) {
    logError("fetchFounderCapacity failed", error);
    return null;
  }
  return normalizeFounderCapacity(data);
}

interface EntitlementRow {
  plan_id: string;
  feature_id: string;
  enabled: boolean;
  limit_value: number | null;
}

export async function fetchEntitlements(supabase: SupabaseClient): Promise<EntitlementSnapshot> {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) {
    logError("fetchEntitlements failed", error);
    return EMPTY_ENTITLEMENTS;
  }

  const rows = (data ?? []) as EntitlementRow[];
  const planId = rows[0]?.plan_id ?? "free";
  const features = Object.fromEntries(
    rows.map((row) => [row.feature_id, { enabled: row.enabled, limit: row.limit_value }]),
  );
  return { planId, features };
}

export interface TeacherRequest {
  id: string;
  title: string;
  votes: number;
  status: "pending" | "in_progress" | "done";
}

export async function fetchRequests(supabase: SupabaseClient): Promise<TeacherRequest[]> {
  const { data, error } = await supabase
    .from("requests")
    .select("id, title, votes, status")
    .order("votes", { ascending: false });

  if (error) logError("fetchRequests failed", error);
  if (error || !data) return [];
  return data;
}

export async function submitRequest(supabase: SupabaseClient, title: string): Promise<string | null> {
  const { error } = await supabase.rpc("submit_my_request", { p_title: title.trim() });
  if (error) {
    logError("submitRequest failed", error);
    return error.message;
  }
  return null;
}

export async function fetchSavedResourceIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const pageSize = 500;
  const ids: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("saved_resources")
      .select("resource_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("resource_id", { ascending: true })
      .range(from, from + pageSize - 1)), "saved resource listing");
    if (!outcome.ok) {
      console.error(`fetchSavedResourceIds failed: ${outcome.reason}`);
      return [];
    }
    const { data, error } = outcome.value;
    if (error) logError("fetchSavedResourceIds failed", error);
    if (error || !data) return [];
    ids.push(...data.map((row) => row.resource_id));
    if (data.length < pageSize) break;
  }
  return ids;
}

export async function setResourceSaved(supabase: SupabaseClient, resourceId: string, saved: boolean): Promise<string | null> {
  const outcome = await withTimeout(Promise.resolve(supabase.rpc("set_my_resource_saved", {
    p_resource_id: resourceId,
    p_saved: saved,
  })), "save resource");
  if (!outcome.ok) {
    console.error(`setResourceSaved failed: ${outcome.reason}`);
    return outcome.reason;
  }
  const { error } = outcome.value;
  if (error) logError(`setResourceSaved (${saved ? "save" : "unsave"}) failed`, error);
  return error?.message ?? null;
}

export interface UpgradeRequest {
  id: string;
  planId: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
}

export async function fetchUpgradeRequests(supabase: SupabaseClient, userId: string): Promise<UpgradeRequest[]> {
  const { data, error } = await supabase
    .from("upgrade_requests")
    .select("id, plan_id, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) logError("fetchUpgradeRequests failed", error);
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, planId: r.plan_id, status: r.status, createdAt: r.created_at }));
}

export async function submitUpgradeRequest(supabase: SupabaseClient, userId: string, planId: string): Promise<string | null> {
  const { error } = await supabase.from("upgrade_requests").insert({ user_id: userId, plan_id: planId });
  if (error) {
    logError("submitUpgradeRequest failed", error);
    return error.message;
  }
  return null;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, plan, avatar_path")
    .eq("id", userId)
    .single();

  if (error) logError("fetchProfile failed", error);
  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    plan: data.plan,
    avatarPath: data.avatar_path,
  };
}

export interface ResourceReview {
  id: string;
  resourceId: string;
  rating: number;
  body: string;
  reviewerName: string;
  reviewerAvatarPath: string | null;
  updatedAt: string;
}

export interface MyResourceReview {
  rating: number;
  body: string;
}

export type ResourceIssueCategory =
  | "cannot_open"
  | "broken_link"
  | "cannot_download"
  | "wrong_content"
  | "other";

export async function fetchResourceReviews(supabase: SupabaseClient, resourceId: string): Promise<ResourceReview[]> {
  const { data, error } = await supabase
    .from("resource_review_feed")
    .select("id, resource_id, rating, body, reviewer_name, reviewer_avatar_path, updated_at")
    .eq("resource_id", resourceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) logError("fetchResourceReviews failed", error);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    resourceId: row.resource_id,
    rating: Number(row.rating),
    body: row.body,
    reviewerName: row.reviewer_name,
    reviewerAvatarPath: row.reviewer_avatar_path,
    updatedAt: row.updated_at,
  }));
}

/**
 * Reads only the caller's own editable review through a narrow RPC. The
 * public feed intentionally omits ownership data, while client code must not
 * query the underlying moderation table directly.
 */
export async function fetchMyResourceReview(
  supabase: SupabaseClient,
  resourceId: string,
): Promise<MyResourceReview | null> {
  const { data, error } = await supabase.rpc("get_my_resource_review", {
    p_resource_id: resourceId,
  });
  if (error) {
    logError("fetchMyResourceReview failed", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const rating = Number((row as { rating?: unknown }).rating);
  const body = (row as { body?: unknown }).body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof body !== "string") return null;
  return { rating, body };
}

export async function upsertMyResourceReview(
  supabase: SupabaseClient,
  resourceId: string,
  rating: number,
  body: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("upsert_my_resource_review", {
    p_resource_id: resourceId,
    p_rating: rating,
    p_body: body.trim(),
  });
  if (error) {
    logError("upsertMyResourceReview failed", error);
    return error.message;
  }
  return null;
}

export async function deleteMyResourceReview(supabase: SupabaseClient, resourceId: string): Promise<string | null> {
  const { error } = await supabase.rpc("delete_my_resource_review", { p_resource_id: resourceId });
  if (error) {
    logError("deleteMyResourceReview failed", error);
    return error.message;
  }
  return null;
}

export async function submitResourceIssue(
  supabase: SupabaseClient,
  resourceId: string,
  category: ResourceIssueCategory,
  details: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("submit_resource_issue", {
    p_resource_id: resourceId,
    p_category: category,
    p_details: details.trim(),
  });
  if (error) {
    logError("submitResourceIssue failed", error);
    return error.message;
  }
  return null;
}

export async function updateMyProfile(
  supabase: SupabaseClient,
  fullName: string,
  avatarPath: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: fullName.trim(),
    p_avatar_path: avatarPath,
  });
  if (error) {
    logError("updateMyProfile failed", error);
    return error.message;
  }
  return null;
}
