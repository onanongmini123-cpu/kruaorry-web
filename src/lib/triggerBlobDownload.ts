// Why the previous fix still left a blank tab: the new tab was navigated
// (directly, or via a same-origin redirect) straight to a URL that
// responds with Content-Disposition: attachment. A browser never commits
// a *document* for a download response, so the tab just sits at
// about:blank forever — and there is no browser-exposed "the download has
// started/finished" event for a plain navigation-triggered download, so
// timing a window.close() off of one is fundamentally a guess (an
// "arbitrary timer" that would need to scale with file size/network speed
// to be safe, and is wrong in both directions otherwise).
//
// The deterministic fix: fetch the file fully as a Blob first. The moment
// that fetch resolves is an unambiguous, non-guessable signal — "we now
// have the entire file, in memory, with nothing further depending on the
// network." Only then do we trigger the actual save (a synthetic click on
// a local blob: URL, which browsers handle synchronously) and it becomes
// safe to close the tab, because nothing after that point can be
// interrupted by closing it.
//
// Tradeoff: unlike a direct Content-Disposition redirect, the browser's
// download-progress indicator won't appear until the whole file has been
// fetched (buffered client-side first, then saved), rather than showing
// live progress as bytes stream in. For this app's 50MB cap that's at
// most a few seconds of "nothing visible yet" on a slow connection — an
// acceptable cost for a tab that reliably closes itself instead of one
// that's merely *usually* closed by a timer guess.

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  blob(): Promise<Blob>;
}

export interface AnchorLike {
  href: string;
  download: string;
  click(): void;
}

export interface BlobDownloadDeps {
  fetchImpl: (url: string, init: { referrerPolicy: ReferrerPolicy }) => Promise<FetchResponseLike>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => AnchorLike;
  appendToBody: (el: AnchorLike) => void;
  removeFromBody: (el: AnchorLike) => void;
  // Yields before revoking the object URL — a fixed, small margin that
  // only lets the browser's own synchronous handling of the click (which
  // reads the blob into its download subsystem) complete first. This does
  // NOT scale with file size or network speed, unlike a timer trying to
  // guess how long an actual download takes — the file is already fully
  // in memory by the time this runs.
  wait: (ms: number) => Promise<void>;
}

export interface BlobDownloadResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export const REVOKE_MARGIN_MS = 200;

function describeError(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

export async function triggerBlobDownload(url: string, fileName: string | null, deps: BlobDownloadDeps): Promise<BlobDownloadResult> {
  let response: FetchResponseLike;
  try {
    response = await deps.fetchImpl(url, { referrerPolicy: "no-referrer" });
  } catch (thrown) {
    return { ok: false, error: describeError(thrown) };
  }

  if (!response.ok) {
    return { ok: false, error: `response not ok`, status: response.status };
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (thrown) {
    return { ok: false, error: describeError(thrown) };
  }

  // From here on, a failure at any step (creating the object URL, the
  // anchor, appending/clicking/removing it, or the post-click wait) must
  // still resolve with { ok: false } rather than reject — this function's
  // caller only ever attaches a plain .then(), so an uncaught rejection
  // here becomes an unhandled promise rejection that leaves the download
  // page stuck showing "กำลังดาวน์โหลดไฟล์...' forever. Cleanup runs
  // exactly once, in `finally`, and is itself best-effort: a failure to
  // remove the anchor or revoke the object URL must not mask the real
  // outcome or skip the other cleanup step.
  let objectUrl: string | null = null;
  let anchor: AnchorLike | null = null;
  try {
    objectUrl = deps.createObjectUrl(blob);
    anchor = deps.createAnchor();
    anchor.href = objectUrl;
    if (fileName) anchor.download = fileName;
    deps.appendToBody(anchor);
    anchor.click();
    await deps.wait(REVOKE_MARGIN_MS);
    return { ok: true };
  } catch (thrown) {
    return { ok: false, error: describeError(thrown) };
  } finally {
    if (anchor) {
      try {
        deps.removeFromBody(anchor);
      } catch {
        // best-effort — the anchor is a detached/inert node either way
      }
    }
    if (objectUrl) {
      try {
        deps.revokeObjectUrl(objectUrl);
      } catch {
        // best-effort — an unrevoked blob: URL outliving the tab is
        // harmless compared to letting a cleanup failure mask the real
        // download outcome
      }
    }
  }
}

// A tab should only try to close itself if it was actually opened as a
// popup (see downloadWindow.ts's AUTO_CLOSE_PARAM — NOT window.opener,
// which this page itself nulls for reverse-tabnabbing before it could ever
// be read as a signal, and which the parent tab already nulled before that)
// — the same-tab fallback path (popup blocked) navigates the user's
// existing tab here, and window.close() on a tab the user opened
// themselves is refused by the browser anyway, so attempting it there
// would just be confusing dead code.
export function shouldCloseTabAfterDownload(openedAsPopup: boolean, result: BlobDownloadResult): boolean {
  return openedAsPopup && result.ok;
}

// Mirrors the Thai messages the /api/resources/[id]/download route itself
// returns as an HTML error page — but since this page reaches that route
// via fetch() (to get the file as a Blob), it never renders that HTML
// body, so the status code is translated back into the same wording here.
export function thaiDownloadErrorMessage(status: number | undefined): string {
  if (status === 401) return "กรุณาเข้าสู่ระบบก่อนดาวน์โหลดไฟล์";
  if (status === 404) return "ไม่พบไฟล์นี้ หรือคุณไม่มีสิทธิ์เข้าถึง";
  return "ดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}
