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
//
// Popup detection deliberately does NOT pass "noopener" to window.open():
// per the WHATWG window.open() algorithm, a call with the noopener flag
// set returns null unconditionally — even when the new browsing context
// was created successfully — which makes "opened" and "blocked" the same
// return value and is exactly what caused this module's first version to
// mis-detect a successful open as blocked (duplicating the navigation and
// sending window.location.assign() over the *source* tab too). Instead we
// take the handle window.open() returns and best-effort null out its
// `.opener` property ourselves, which achieves the same reverse-tabnabbing
// protection "noopener" provides, without losing the ability to tell a
// genuine block apart from success. The download route itself also sends
// `Referrer-Policy: no-referrer`, so the destination never learns this
// page's URL regardless of the opener relationship.

export interface OpenedWindow {
  opener: unknown;
}

export interface WindowOpener {
  open(url: string, target: string): OpenedWindow | null;
  assign(url: string): void;
}

export type OpenDownloadOutcome = "opened" | "fallback" | "failed";

export interface OpenDownloadResult {
  outcome: OpenDownloadOutcome;
  // Set only when window.open() itself threw (not just returned null).
  openError?: string;
  // Set only when the same-tab fallback (assign) also failed.
  assignError?: string;
}

// "opened": window.open() returned a handle — the usual case.
// "fallback": window.open() returned null or threw, so the same tab was
//   navigated instead — the signed URL's Content-Disposition still
//   triggers a download rather than losing the app.
// "failed": both the popup and the same-tab fallback failed — the only
//   case the caller needs to show an error for. The real cause is
//   returned (never swallowed) so the caller can log it structured.
export function openDownloadInNewTab(url: string, opener: WindowOpener): OpenDownloadResult {
  let win: OpenedWindow | null = null;
  let openError: string | undefined;
  try {
    win = opener.open(url, "_blank");
  } catch (thrown) {
    win = null;
    openError = thrown instanceof Error ? thrown.message : String(thrown);
  }

  if (win) {
    try {
      win.opener = null;
    } catch {
      // Some browsers make `opener` non-configurable on a cross-origin
      // handle — nothing more to do; the tab still opened successfully.
    }
    return { outcome: "opened" };
  }

  try {
    opener.assign(url);
    return { outcome: "fallback", openError };
  } catch (thrown) {
    const assignError = thrown instanceof Error ? thrown.message : String(thrown);
    return { outcome: "failed", openError, assignError };
  }
}
