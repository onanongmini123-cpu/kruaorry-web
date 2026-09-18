import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResourceTarget {
  delivery_mode: "web_app" | "google_template" | "google_form" | "file_download";
  cta_url: string | null;
  file_path: string | null;
  file_name: string | null;
}

// RPC data is untyped without generated Supabase types. Validate before any
// redirect, download, or administrator cleanup uses private target fields.
export function parseResourceTarget(value: unknown): ResourceTarget | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!["web_app", "google_template", "google_form", "file_download"].includes(String(row.delivery_mode))) return null;
  if (row.cta_url !== null && typeof row.cta_url !== "string") return null;
  if (row.file_path !== null && typeof row.file_path !== "string") return null;
  if (row.file_name !== null && typeof row.file_name !== "string") return null;
  return row as unknown as ResourceTarget;
}

// All administrator edit, publish and delete paths need this same guarded
// read. Never fall back to a direct resources.cta_url/file_path SELECT: those
// columns are intentionally denied even to the authenticated database role.
export async function loadResourceTarget(client: SupabaseClient, id: string): Promise<{ target: ResourceTarget | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("resolve_resource_target", { p_resource_id: id }).maybeSingle();
    if (error) return { target: null, error: error.message };
    const target = parseResourceTarget(data);
    return target ? { target, error: null } : { target: null, error: "ไม่พบปลายทางของสื่อหรือไม่มีสิทธิ์" };
  } catch {
    return { target: null, error: "ตรวจสอบปลายทางของสื่อไม่สำเร็จ" };
  }
}
