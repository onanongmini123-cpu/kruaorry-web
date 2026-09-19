export interface EntitlementResource {
  status: "draft" | "published" | "archived";
  isFree: boolean;
}

export interface EntitlementProfile {
  role: "member" | "admin" | "owner";
}

export interface EntitlementGrant {
  enabled: boolean;
  limit: number | null;
}

export interface EntitlementSnapshot {
  planId: string;
  features: Record<string, EntitlementGrant>;
}

export const EMPTY_ENTITLEMENTS: EntitlementSnapshot = {
  planId: "free",
  features: {},
};

export function hasEntitlement(snapshot: EntitlementSnapshot | null, featureId: string): boolean {
  return snapshot?.features[featureId]?.enabled === true;
}

export function entitlementLimit(snapshot: EntitlementSnapshot | null, featureId: string): number | null {
  const grant = snapshot?.features[featureId];
  return grant?.enabled ? grant.limit : null;
}

// Single source of truth for "can this viewer open this resource" on the
// client. Mirrors the storage.objects RLS policy in
// supabase/migrations/20260829015429_014b_fix_resource_files_entitlement.sql
// exactly (admin/owner bypass, then published-only, then free-or-capability),
// so the UI never shows an action the server would actually deny, and never
// hides one the server would actually allow.
export function canAccessResource(resource: EntitlementResource, profile: EntitlementProfile | null, entitlements: EntitlementSnapshot | null): boolean {
  if (profile?.role === "admin" || profile?.role === "owner") return true;
  if (resource.status !== "published") return false;
  if (resource.isFree) return true;
  return hasEntitlement(entitlements, "download.premium");
}
