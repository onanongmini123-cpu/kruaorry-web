import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { canAccessAdminConsole } from "@/lib/routeAccess";

// The back office is never a search or sharing target.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Server-side gate for the whole /admin tree. The console itself is a client
 * page that re-checks the role, and every admin mutation is still enforced by
 * database policies and RPCs; this layer additionally keeps the admin UI from
 * being served to anyone who is not an admin or owner. It fails closed: if the
 * role cannot be read, the visitor is sent to the member app.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const destination = await resolveAdminDestination();
  if (destination) redirect(destination);
  return children;
}

async function resolveAdminDestination(): Promise<string | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return "/app";
  }

  const auth = await withTimeout(supabase.auth.getUser(), "admin auth");
  const user = auth.ok && !auth.value.error ? auth.value.data.user : null;
  if (!isPermanentAuthUser(user)) return "/login?next=%2Fadmin";

  const profile = await withTimeout(
    Promise.resolve(supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()),
    "admin role",
  );
  if (!profile.ok || profile.value.error) return "/app";
  return canAccessAdminConsole(profile.value.data?.role) ? null : "/app";
}
