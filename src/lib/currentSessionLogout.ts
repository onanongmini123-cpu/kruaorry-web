export const CURRENT_SESSION_LOGOUT_ERROR = "ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง";

type CurrentSessionAuth = {
  signOut: (options: { scope: "local" }) => Promise<{ error: unknown | null }>;
  getSession: () => Promise<{ data: { session: unknown | null } }>;
};

export async function signOutCurrentSession(auth: CurrentSessionAuth): Promise<string | null> {
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (!error) return null;
  } catch {
    // Supabase can still remove the browser session before a remote sign-out
    // request fails. The local state below is the source of truth for whether
    // this device must leave the authenticated UI.
  }

  try {
    const { data } = await auth.getSession();
    return data.session ? CURRENT_SESSION_LOGOUT_ERROR : null;
  } catch {
    return CURRENT_SESSION_LOGOUT_ERROR;
  }
}
