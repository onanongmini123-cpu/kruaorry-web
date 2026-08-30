import { describe, expect, it, vi } from "vitest";
import { openDownloadInNewTab } from "../downloadWindow";

describe("openDownloadInNewTab", () => {
  it("returns 'opened' when window.open succeeds, and never touches the same-tab fallback", () => {
    const opener = { open: vi.fn(() => ({ closed: false })), assign: vi.fn() };
    const outcome = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(outcome).toBe("opened");
    expect(opener.open).toHaveBeenCalledWith("/api/resources/r1/download", "_blank", "noopener,noreferrer");
    expect(opener.assign).not.toHaveBeenCalled();
  });

  it("falls back to a same-tab navigation when window.open returns null (popup blocked)", () => {
    const opener = { open: vi.fn(() => null), assign: vi.fn() };
    const outcome = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(outcome).toBe("fallback");
    expect(opener.assign).toHaveBeenCalledWith("/api/resources/r1/download");
  });

  it("falls back to a same-tab navigation when window.open throws instead of returning null", () => {
    const opener = {
      open: vi.fn(() => {
        throw new Error("blocked by policy");
      }),
      assign: vi.fn(),
    };
    const outcome = openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(outcome).toBe("fallback");
    expect(opener.assign).toHaveBeenCalledWith("/api/resources/r1/download");
  });

  // The closest analogue to the old "navigation assignment failure" case:
  // with no pre-opened blank tab left to clean up (the whole point of this
  // module is that one is never created), the only failure mode left is
  // both the popup and the same-tab fallback failing — this must report
  // "failed" instead of throwing, so the caller can show an error.
  it("reports 'failed' — never throws — when both the popup and the same-tab fallback fail", () => {
    const opener = {
      open: vi.fn(() => null),
      assign: vi.fn(() => {
        throw new Error("navigation blocked");
      }),
    };
    expect(() => openDownloadInNewTab("/api/resources/r1/download", opener)).not.toThrow();
    expect(openDownloadInNewTab("/api/resources/r1/download", opener)).toBe("failed");
  });

  it("passes noopener/noreferrer so the opened tab never gets a reference back to window.opener", () => {
    const opener = { open: vi.fn(() => ({ closed: false })), assign: vi.fn() };
    openDownloadInNewTab("/api/resources/r1/download", opener);
    expect(opener.open).toHaveBeenCalledWith(expect.any(String), "_blank", "noopener,noreferrer");
  });
});
