export type AppRole = "member" | "admin" | "owner";

export function isProtectedAppPath(pathname: string): boolean {
  return pathname === "/app"
    || pathname.startsWith("/app/")
    || pathname === "/admin"
    || pathname.startsWith("/admin/");
}

export function canAccessMemberExperience(role: unknown): role is AppRole {
  return role === "member" || role === "admin" || role === "owner";
}

export function canAccessAdminConsole(role: unknown): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}
