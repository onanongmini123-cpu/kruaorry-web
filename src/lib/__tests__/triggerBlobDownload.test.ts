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
    // remove/revoke both happen last, together, in a single cleanup step —
    // harmless to defer past the wait, since click()'s synchronous handling
    // of the download has already completed by then regardless.
    expect(calls).toEqual(["fetch", "createObjectUrl", "append", "click", "wait", "remove", "revokeObjectUrl"]);
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

  // Regression coverage: the DOM/cleanup stage (createObjectUrl through the
  // post-click wait) previously ran with no try/catch at all. Any of these
  // steps throwing left the returned promise *rejecting* instead of
  // resolving with { ok: false } — and the download page only ever attaches
  // a plain .then(), so that became an unhandled rejection that left the
  // tab stuck on "กำลังดาวน์โหลดไฟล์..." forever. Every one of these must
  // resolve with { ok: false }, and — since the file was already fully
  // fetched by this point — must still attempt cleanup (best-effort, so a
  // cleanup failure itself must not throw or skip the other cleanup step).
  it("resolves with { ok: false } (never rejects) when createObjectUrl throws, and skips anchor cleanup since no anchor was ever created", async () => {
    const { deps, calls } = fakeDeps({
      createObjectUrl: vi.fn(() => {
        throw new Error("createObjectURL quota exceeded");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/quota exceeded/) });
    expect(deps.createAnchor).not.toHaveBeenCalled();
    expect(deps.removeFromBody).not.toHaveBeenCalled();
    expect(deps.revokeObjectUrl).not.toHaveBeenCalled();
    expect(calls).toEqual(["fetch"]);
  });

  it("resolves with { ok: false } and still revokes the object URL when createAnchor throws", async () => {
    const { deps } = fakeDeps({
      createAnchor: vi.fn(() => {
        throw new Error("anchor creation failed");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/anchor creation failed/);
    expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(deps.removeFromBody).not.toHaveBeenCalled(); // no anchor ever existed to remove
  });

  it("resolves with { ok: false } and still cleans up (remove + revoke, exactly once each) when appendToBody throws", async () => {
    const { deps } = fakeDeps({
      appendToBody: vi.fn(() => {
        throw new Error("appendChild failed");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/appendChild failed/);
    expect(deps.removeFromBody).toHaveBeenCalledTimes(1);
    expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("resolves with { ok: false } and still cleans up (remove + revoke, exactly once each) when anchor.click() throws", async () => {
    const anchor: AnchorLike = {
      href: "",
      download: "",
      click: vi.fn(() => {
        throw new Error("click blocked by popup policy");
      }),
    };
    const { deps } = fakeDeps({ createAnchor: vi.fn(() => anchor) });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/click blocked/);
    expect(deps.removeFromBody).toHaveBeenCalledTimes(1);
    expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("resolves with { ok: false } and still cleans up when the post-click wait rejects", async () => {
    const { deps } = fakeDeps({
      wait: vi.fn(async () => {
        throw new Error("timer failure");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timer failure/);
    expect(deps.removeFromBody).toHaveBeenCalledTimes(1);
    expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("does not throw, and still revokes the object URL, when removeFromBody itself throws during cleanup", async () => {
    const { deps } = fakeDeps({
      removeFromBody: vi.fn(() => {
        throw new Error("remove failed — node already detached");
      }),
    });

    const result = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", deps);

    // The download itself succeeded (click already happened) — a cosmetic
    // cleanup failure must not turn a real success into a reported failure.
    expect(result).toEqual({ ok: true });
    expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("does not throw when revokeObjectUrl itself throws during cleanup, on either the success or failure path", async () => {
    const { deps: successDeps } = fakeDeps({
      revokeObjectUrl: vi.fn(() => {
        throw new Error("revoke failed");
      }),
    });
    await expect(triggerBlobDownload("/api/resources/r1/download", "x.pdf", successDeps)).resolves.toEqual({ ok: true });

    const { deps: failureDeps } = fakeDeps({
      revokeObjectUrl: vi.fn(() => {
        throw new Error("revoke failed");
      }),
      wait: vi.fn(async () => {
        throw new Error("timer failure");
      }),
    });
    const failureResult = await triggerBlobDownload("/api/resources/r1/download", "x.pdf", failureDeps);
    expect(failureResult.ok).toBe(false);
    expect(failureResult.error).toMatch(/timer failure/); // the real cause, not masked by the cleanup failure
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
