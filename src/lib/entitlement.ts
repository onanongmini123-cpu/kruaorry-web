export interface EntitlementResource {
  status: "draft" | "published" | "archived";
  accessMode: ResourceAccessMode;
  requiredPlanIds: readonly string[];
}

export type ResourceAccessMode = "public" | "authenticated" | "plans" | "locked";

export interface ResourceAccessViewer {
  authenticated: boolean;
  role: "member" | "admin" | "owner" | null;
  planId: string | null;
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

// UI mirror of public.can_access_resource(uuid). The database function and
// Storage RLS remain authoritative; this helper only prevents presenting an
// action that the server will reject. Access is explicitly independent from
// publish status so admins can preview drafts without weakening member rules.
export function canAccessResource(resource: EntitlementResource, viewer: ResourceAccessViewer): boolean {
  if (viewer.authenticated && (viewer.role === "admin" || viewer.role === "owner")) return true;
  if (resource.status !== "published") return false;

  if (resource.accessMode === "public") return true;
  if (resource.accessMode === "authenticated") return viewer.authenticated;
  if (resource.accessMode === "plans") {
    return viewer.authenticated
      && typeof viewer.planId === "string"
      && resource.requiredPlanIds.includes(viewer.planId);
  }
  return false;
}
