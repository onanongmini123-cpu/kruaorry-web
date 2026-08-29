import { Sparkles, FileSpreadsheet, Gamepad2, ClipboardCheck, FileDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceAffordance } from "@/components/ui";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

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
  ctaUrl: string | null;
  coverImageUrl: string | null;
  tags: string[];
  free: boolean;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
}

export interface Plan {
  id: string;
  name: string;
  priceLabel: string;
  note: string | null;
  features: string[];
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: "member" | "admin";
  plan: string;
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

export function resourceIcon(affordance: ResourceAffordance): LucideIcon {
  return ICON_BY_MODE[affordance] ?? Sparkles;
}

export function resourceTint(affordance: ResourceAffordance): "purple" | "pink" | "blue" {
  return TINT_BY_MODE[affordance] ?? "purple";
}

export async function fetchPublishedResources(supabase: SupabaseClient): Promise<Resource[]> {
  const { data, error } = await supabase
    .from("resources")
    .select("id, title, meta, description, category, delivery_mode, cta_url, cover_image_url, tags, is_free, file_path, file_name, file_size")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) logError("fetchPublishedResources failed", error);
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    meta: r.meta ?? "",
    description: r.description,
    category: r.category,
    affordance: r.delivery_mode as ResourceAffordance,
    ctaUrl: r.cta_url,
    coverImageUrl: r.cover_image_url,
    tags: r.tags ?? [],
    free: r.is_free,
    filePath: r.file_path,
    fileName: r.file_name,
    fileSize: r.file_size,
  }));
}

const RESOURCE_FILES_BUCKET = "resource-files";

// Generates a short-lived signed URL for a private resource file. RLS on
// storage.objects enforces publish status + plan entitlement server-side;
// this only succeeds if the caller is actually allowed to read the object.
// `download` sets Content-Disposition: attachment on Supabase's response,
// so navigating to the URL downloads the file instead of rendering it —
// this works even cross-origin (unlike an <a download> attribute), which
// is what lets the caller avoid a same-tab SPA navigation.
export async function getSignedFileUrl(supabase: SupabaseClient, filePath: string, fileName?: string | null, expiresInSeconds = 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(RESOURCE_FILES_BUCKET).createSignedUrl(filePath, expiresInSeconds, { download: fileName || true });
  if (error) {
    console.error(`getSignedFileUrl failed: ${error.message}`);
    return null;
  }
  return data.signedUrl;
}

export async function fetchPlans(supabase: SupabaseClient): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_label, note, features")
    .order("sort_order", { ascending: true });

  if (error) logError("fetchPlans failed", error);
  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    priceLabel: p.price_label,
    note: p.note,
    features: p.features ?? [],
  }));
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

export async function submitRequest(supabase: SupabaseClient, userId: string, title: string): Promise<string | null> {
  const { error } = await supabase.from("requests").insert({ title: title.trim(), requested_by: userId });
  if (error) {
    logError("submitRequest failed", error);
    return error.message;
  }
  return null;
}

export async function fetchSavedResourceIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("saved_resources").select("resource_id").eq("user_id", userId);
  if (error) logError("fetchSavedResourceIds failed", error);
  if (error || !data) return [];
  return data.map((r) => r.resource_id);
}

export async function setResourceSaved(supabase: SupabaseClient, userId: string, resourceId: string, saved: boolean): Promise<void> {
  if (saved) {
    const { error } = await supabase.from("saved_resources").insert({ user_id: userId, resource_id: resourceId });
    if (error) logError("setResourceSaved (save) failed", error);
    return;
  }
  const { error } = await supabase.from("saved_resources").delete().eq("user_id", userId).eq("resource_id", resourceId);
  if (error) logError("setResourceSaved (unsave) failed", error);
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
    .select("id, email, full_name, role, plan")
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
  };
}
