import { describe, expect, it, vi } from "vitest";
import { triggerBlobDownload, shouldCloseTabAfterDownload, thaiDownloadErrorMessage, REVOKE_MARGIN_MS, type BlobDownloadDeps, type FetchResponseLike, type AnchorLike } from "../triggerBlobDownload";

function fakeDeps(overrides: Partial<BlobDownloadDeps> = {}) {
  const calls: string[] = [];
  const anchor: AnchorLike = { href: "", download: "", click: vi.fn(() => calls.push("click")) };
  const response: FetchResponseLike = { ok: true, status: 200, blob: async () => new Blob(["file bytes"]) };

  const deps: BlobDownloadDeps = {
    fetchImpl: vi.fn(async () => {
      calls.push("fetch");
      return response;
    }),
    createObjectUrl: vi.fn(() => {
      calls.push("createObjectUrl");
      return "blob:fake-object-url";
    }),
    revokeObjectUrl: vi.fn(() => calls.push("revokeObjectUrl")),
    createAnchor: vi.fn(() => anchor),
    appendToBody: vi.fn(() => calls.push("append")),
    removeFromBody: vi.fn(() => calls.push("remove")),
    wait: vi.fn(async () => {
      calls.push("wait");
    }),
    ...overrides,
  };
  return { deps, calls, anchor, response };
}

describe("triggerBlobDownload", () => {
  it("on success: fetches with no-referrer, buffers the whole file as a Blob, triggers a local anchor click, then waits before revoking", async () => {
    const { deps, calls, anchor } = fakeDeps();

    const result = await triggerBlobDownload("/api/resources/r1/download", "worksheet.pdf", deps);

    expect(result).toEqual({ ok: true });
    expect(deps.fetchImpl).toHaveBeenCalledWith("/api/resources/r1/download", { referrerPolicy: "no-referrer" });
    expect(anchor.href).toBe("blob:fake-object-url");
    expect(anchor.download).toBe("worksheet.pdf");
    // The click must happen only once the file is fully buffered, and the
    // object URL must not be revoked until after the wait margin — never
    // before the click, which would risk the browser reading a dead URL.
    expect(calls).toEqual(["fetch", "createObjectUrl", "append", "click", "remove", "wait", "revokeObjectUrl"]);
    expect(deps.wait).toHaveBeenCalledWith(REVOKE_MARGIN_MS);
  });

  it("does not set the anchor's download attribute when no file name is available", async () => {
    const { deps, anchor } = fakeDeps();
    await triggerBlobDownload("/api/resources/r1/download", null, deps);
    expect(anchor.download).toBe("");
  });

  it("fails without touching the DOM when fetch() itself throws (e.g. network error)", async () => {
    const { deps, calls } = fakeDeps({
      fetchImpl: vi.fn(async () => {
        throw new Error("network dropped");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network dropped/);
    expect(calls).toEqual([]); // no createObjectUrl/anchor/append/click/revoke ever attempted
    expect(deps.createObjectUrl).not.toHaveBeenCalled();
  });

  it("fails with the status code when the route responds with an error (e.g. 401/404/500 from the API route)", async () => {
    const { deps } = fakeDeps({
      fetchImpl: vi.fn(async () => ({ ok: false, status: 401, blob: async () => new Blob([]) }) as FetchResponseLike),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("fails without touching the DOM when response.blob() itself throws", async () => {
    const { deps } = fakeDeps({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => {
          throw new Error("stream interrupted");
        },
      })),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/stream interrupted/);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.createObjectUrl).not.toHaveBeenCalled();
    expect(deps.createAnchor).not.toHaveBeenCalled();
    expect(deps.revokeObjectUrl).not.toHaveBeenCalled();
  });
});

describe("shouldCloseTabAfterDownload", () => {
  it("closes only when the tab was opened via script AND the download succeeded", () => {
    expect(shouldCloseTabAfterDownload(true, { ok: true })).toBe(true);
  });

  it("does not close when the download failed, even if the tab was opened via script", () => {
    expect(shouldCloseTabAfterDownload(true, { ok: false })).toBe(false);
  });

  it("does not close when there was no opener, even on success — this is the same-tab fallback path, where window.close() would be refused anyway", () => {
    expect(shouldCloseTabAfterDownload(false, { ok: true })).toBe(false);
  });

  it("does not close when there was neither an opener nor a success", () => {
    expect(shouldCloseTabAfterDownload(false, { ok: false })).toBe(false);
  });
});

describe("thaiDownloadErrorMessage", () => {
  it("maps 401 to a sign-in message, matching the API route's own 401 wording", () => {
    expect(thaiDownloadErrorMessage(401)).toMatch(/เข้าสู่ระบบ/);
  });

  it("maps 404 to a not-found/not-entitled message, matching the API route's own 404 wording", () => {
    expect(thaiDownloadErrorMessage(404)).toMatch(/ไม่พบไฟล์/);
  });

  it("falls back to a generic retry message for any other status or an undefined status", () => {
    expect(thaiDownloadErrorMessage(500)).toMatch(/ลองใหม่/);
    expect(thaiDownloadErrorMessage(undefined)).toMatch(/ลองใหม่/);
  });
});
