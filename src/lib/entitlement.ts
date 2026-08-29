export interface EntitlementResource {
  status: "draft" | "published" | "archived";
  isFree: boolean;
}

export interface EntitlementProfile {
  plan: string;
  role: "member" | "admin";
}

// Single source of truth for "can this viewer open this resource" on the
// client. Mirrors the storage.objects RLS policy in
// supabase/migrations/20260829015429_014b_fix_resource_files_entitlement.sql
// exactly (admin bypass, then published-only, then free-or-paid-plan), so
// the UI never shows an action the server would actually deny, and never
// hides one the server would actually allow.
export function canAccessResource(resource: EntitlementResource, profile: EntitlementProfile | null): boolean {
  if (profile?.role === "admin") return true;
  if (resource.status !== "published") return false;
  if (resource.isFree) return true;
  return profile != null && profile.plan !== "free";
}
