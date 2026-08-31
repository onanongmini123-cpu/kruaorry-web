// Pure decision logic for what happens to the admin console's own local
// state after the viewer changes their own role. Kept separate from
// admin/page.tsx so the state-transition rules are unit-testable without
// a Supabase client or a React render.

export type MemberRole = "member" | "admin" | "owner";

export interface SelfRoleChangeEffect {
  viewerRole: MemberRole;
  clearAuditLog: boolean;
  // null means "leave the current view as-is".
  view: string | null;
  redirectToApp: boolean;
}

// Called only after the profiles.role UPDATE for the viewer's own row has
// already succeeded server-side — the DB is the source of truth here, this
// only decides how the client should stop rendering a privilege level the
// server no longer grants, without waiting for a page refresh.
//
// Returns null when the role didn't actually change (e.g. an owner
// re-confirming "owner" for themselves), so callers don't clear the audit
// log or bump the viewer out of the audit view for a no-op update.
export function applySelfRoleChange(previousRole: MemberRole, newRole: MemberRole, currentView: string): SelfRoleChangeEffect | null {
  if (newRole === previousRole) return null;
  return {
    viewerRole: newRole,
    clearAuditLog: true,
    view: currentView === "audit" ? "members" : null,
    redirectToApp: newRole === "member",
  };
}
