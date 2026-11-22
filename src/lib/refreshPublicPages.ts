// Asks the server to drop the cached public pages after an admin saved
// something they show. Best effort: a failure only means the old 5 minute
// timers apply, so it never throws.
export async function refreshPublicPages(): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/refresh-public", { method: "POST", credentials: "same-origin" });
    return response.ok;
  } catch {
    return false;
  }
}
