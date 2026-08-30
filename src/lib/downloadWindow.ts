// Opening a file download used to mean: open a blank tab, await an async
// signed-URL fetch, then set the blank tab's location. That async gap
// between window.open() and the eventual navigation is exactly what makes
// browsers (Safari/iOS especially, but this project also saw it hang in
// Chrome) refuse to treat the later navigation as user-initiated — and if
// the await never settles, the blank tab is stuck forever with no feedback.
//
// The fix is architectural: the URL to open is now a same-origin API route
// (/api/resources/[id]/download) that's known synchronously at click time,
// so window.open() can be called immediately, inside the click handler,
// with a real URL — no gap, no possibility of an orphaned blank tab. The
// route itself does the async entitlement + signed-URL work server-side
// and responds with a redirect or a Thai error page.
//
// This module only decides how to open that known URL, kept pure/injectable
// so it's testable without a real browser.

export interface WindowOpener {
  open(url: string, target: string, features: string): { closed?: boolean } | null;
  assign(url: string): void;
}

export type OpenDownloadOutcome = "opened" | "fallback" | "failed";

// "opened": window.open() succeeded — the usual case.
// "fallback": window.open() returned null (blocked) or threw, so the same
//   tab was navigated instead — the signed URL's Content-Disposition still
//   triggers a download rather than losing the app.
// "failed": both the popup and the same-tab fallback failed — the only
//   case the caller needs to show an error for.
export function openDownloadInNewTab(url: string, opener: WindowOpener): OpenDownloadOutcome {
  let win: { closed?: boolean } | null = null;
  try {
    win = opener.open(url, "_blank", "noopener,noreferrer");
  } catch {
    win = null;
  }
  if (win) return "opened";

  try {
    opener.assign(url);
    return "fallback";
  } catch {
    return "failed";
  }
}
