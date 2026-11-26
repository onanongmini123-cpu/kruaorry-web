// After a sign-in, sign-up, sign-out or password reset the browser goes to ONE place, once.
//
// The old pattern (a router replace followed at once by a router refresh) starts two overlapping
// navigations: the refresh re-requests the page the visitor is leaving (for example
// /admin, which the server now answers with a redirect) while the replace is still
// in flight. Depending on timing that left the visitor on a half-rendered /admin or
// on the page they were trying to leave (a sign-out that seemed to do nothing).
// A single full navigation also guarantees the server sees the new cookies and that
// no stale client-side page cache survives a change of account.

type LocationLike = { replace: (url: string) => void };

/** Only same-site paths ("/x", not "//host" and not a backslash trick). Returns whether it navigated. */
export function navigateAfterAuthChange(path: string, location: LocationLike = window.location): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  location.replace(path);
  return true;
}
