import { describe, expect, it, vi, afterEach } from "vitest";
import { withTimeout, ASYNC_STAGE_TIMEOUT_MS } from "../asyncTimeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    const result = await withTimeout(Promise.resolve("ok"), "stage");
    expect(result).toEqual({ ok: true, value: "ok" });
  });

  it("catches a thrown/rejected exception instead of propagating it", async () => {
    const result = await withTimeout(Promise.reject(new Error("boom")), "stage");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/stage threw: boom/);
      expect(result.timedOut).toBe(false);
    }
  });

  it("times out instead of hanging forever when the promise never settles", async () => {
    vi.useFakeTimers();
    const promise = withTimeout(new Promise(() => {}), "stage");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.timedOut).toBe(true);
      expect(result.reason).toMatch(/stage timed out/);
    }
  });

  it("redacts a token/URL embedded in a thrown error's message", async () => {
    const result = await withTimeout(Promise.reject(new Error("failed: https://x/y?token=SUPER-SECRET")), "stage");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toMatch(/SUPER-SECRET/);
      expect(result.reason).not.toMatch(/https?:\/\//);
    }
  });

  it("respects a custom timeout duration", async () => {
    vi.useFakeTimers();
    const promise = withTimeout(new Promise(() => {}), "stage", 100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result.ok).toBe(false);
  });
});
