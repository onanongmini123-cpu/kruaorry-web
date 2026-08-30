import { describe, expect, it, vi } from "vitest";
import { openDownloadInNewTab, AUTO_CLOSE_PARAM, type OpenedWindow, type WindowOpener } from "../downloadWindow";
import { shouldCloseTabAfterDownload } from "../triggerBlobDownload";

describe("openDownloadInNewTab", () => {
  // Per the WHATWG window.open() algorithm, a call with the noopener flag
  // set returns null unconditionally, even when the new browsing context
  // was created successfully — so a spec-correct mock for a *successful*
  // open must return a real handle only when "noopener" is NOT requested.
  // This is the exact case that broke the previous version of this module.

  it("returns 'opened' when window.open() returns a handle, and never touches the same-tab fallback", () => {
    const win: OpenedWindow = { opener: "something" };
    const opener = { open: vi.fn(() => win), assign: vi.fn() };
    const result = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(result.outcome).toBe("opened");
    expect(opener.assign).not.toHaveBeenCalled();
  });

  it("does not pass 'noopener' (or any features string) to window.open — that would make success and blocked indistinguishable", () => {
    const opener = { open: vi.fn(() => ({ opener: null }) as OpenedWindow), assign: vi.fn() };
    openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(opener.open).toHaveBeenCalledWith(`/api/resources/r1/download?${AUTO_CLOSE_PARAM}=1`, "_blank");
    expect(opener.open).toHaveBeenCalledTimes(1);
    const call = opener.open.mock.calls[0];
    expect(call).toHaveLength(2); // exactly (url, target) — no features/noopener argument
  });

  it("adds the auto-close marker to the popup URL, and appends it after any existing query string", () => {
    const opener = { open: vi.fn(() => ({ opener: null }) as OpenedWindow), assign: vi.fn() };
    openDownloadInNewTab("/download/r1?name=worksheet.pdf", opener);
    expect(opener.open).toHaveBeenCalledWith(`/download/r1?name=worksheet.pdf&${AUTO_CLOSE_PARAM}=1`, "_blank");
  });

  it("never adds the auto-close marker to the same-tab fallback URL — window.close() must never be attempted on a tab the user was already looking at", () => {
    const opener = { open: vi.fn(() => null), assign: vi.fn() };
    openDownloadInNewTab("/download/r1?name=worksheet.pdf", opener);
    expect(opener.assign).toHaveBeenCalledWith("/download/r1?name=worksheet.pdf");
  });

  it("severs window.opener on the newly opened tab as a reverse-tabnabbing mitigation, instead of relying on 'noopener'", () => {
    const win: OpenedWindow = { opener: "the calling page" };
    const opener = { open: vi.fn(() => win), assign: vi.fn() };
    openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(win.opener).toBeNull();
  });

  it("does not throw, and still reports 'opened', if nulling .opener itself throws (non-configurable property)", () => {
    const win = {} as OpenedWindow;
    Object.defineProperty(win, "opener", {
      configurable: false,
      get() {
        return "locked";
      },
      set() {
        throw new Error("Cannot assign to read only property 'opener'");
      },
    });
    const opener = { open: vi.fn(() => win), assign: vi.fn() };
    expect(() => openDownloadInNewTab("/api/resources/r1/download", opener)).not.toThrow();
    const result = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(result.outcome).toBe("opened");
    expect(opener.assign).not.toHaveBeenCalled();
  });

  it("falls back to a same-tab navigation when window.open() returns null (a genuine block)", () => {
    const opener = { open: vi.fn(() => null), assign: vi.fn() };
    const result = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(result.outcome).toBe("fallback");
    expect(opener.assign).toHaveBeenCalledWith("/api/resources/r1/download");
  });

  it("falls back to a same-tab navigation when window.open() throws, and surfaces the real cause as openError", () => {
    const opener = {
      open: vi.fn(() => {
        throw new Error("blocked by extension policy");
      }),
      assign: vi.fn(),
    };
    const result = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(result.outcome).toBe("fallback");
    expect(result.openError).toMatch(/blocked by extension policy/);
    expect(opener.assign).toHaveBeenCalledWith("/api/resources/r1/download");
  });

  it("reports 'failed' — never throws — when both the popup and the same-tab fallback fail, with both real causes attached", () => {
    const opener = {
      open: vi.fn(() => {
        throw new Error("popup rejected");
      }),
      assign: vi.fn(() => {
        throw new Error("navigation blocked");
      }),
    };
    let result;
    expect(() => {
      result = openDownloadInNewTab("/api/resources/r1/download", opener);
    }).not.toThrow();
    expect(result!.outcome).toBe("failed");
    expect(result!.openError).toMatch(/popup rejected/);
    expect(result!.assignError).toMatch(/navigation blocked/);
  });

  it("reports 'failed' with only assignError when open() returns null (not thrown) and assign() throws", () => {
    const opener = {
      open: vi.fn(() => null),
      assign: vi.fn(() => {
        throw new Error("navigation blocked");
      }),
    };
    const result = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(result.outcome).toBe("failed");
    expect(result.openError).toBeUndefined();
    expect(result.assignError).toMatch(/navigation blocked/);
  });
});

// Regression coverage for the bug where the download tab could never
// auto-close on the normal, successful popup path: openDownloadInNewTab
// nulls win.opener synchronously, in the parent, before the popup's own JS
// runs — so a page that read window.opener to decide whether to close
// itself always saw it as already-null, indistinguishable from the
// same-tab fallback (popup blocked) path. These tests exercise the real
// public contract end to end — the exact URL openDownloadInNewTab hands to
// window.open()/assign(), parsed the same way the download page parses
// its own location — rather than window.opener, which this module
// deliberately destroys regardless of outcome and which can therefore
// never be a valid signal for this decision.
describe("auto-close marker survives to the download page's own decision (integration)", () => {
  function openedAsPopupFrom(url: string): boolean {
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    return new URLSearchParams(query).get(AUTO_CLOSE_PARAM) === "1";
  }

  it("parent success path: window.open() is called with a URL that yields auto-close on a successful download", () => {
    const win: OpenedWindow = { opener: "the calling page" };
    let openedUrl = "";
    const opener: WindowOpener = {
      open: (url) => {
        openedUrl = url;
        return win;
      },
      assign: vi.fn(),
    };

    const result = openDownloadInNewTab("/download/r1?name=worksheet.pdf", opener);

    expect(result.outcome).toBe("opened");
    expect(shouldCloseTabAfterDownload(openedAsPopupFrom(openedUrl), { ok: true })).toBe(true);
    expect(shouldCloseTabAfterDownload(openedAsPopupFrom(openedUrl), { ok: false })).toBe(false);
  });

  it("fallback path (popup blocked): the same-tab navigation URL never yields auto-close, even on a successful download", () => {
    let fallbackUrl = "";
    const opener: WindowOpener = {
      open: () => null,
      assign: (url) => {
        fallbackUrl = url;
      },
    };

    const result = openDownloadInNewTab("/download/r1?name=worksheet.pdf", opener);

    expect(result.outcome).toBe("fallback");
    expect(shouldCloseTabAfterDownload(openedAsPopupFrom(fallbackUrl), { ok: true })).toBe(false);
  });
});
