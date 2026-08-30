import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSignedFileUrl } from "../data";

type CreateSignedUrlResult = { data: { signedUrl: string } | null; error: { message: string } | null };

function fakeSupabase(createSignedUrl: (path: string, expiresIn: number, options?: unknown) => Promise<CreateSignedUrlResult>): SupabaseClient {
  return {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getSignedFileUrl", () => {
  it("returns the signed URL on success", async () => {
    const supabase = fakeSupabase(async () => ({ data: { signedUrl: "https://storage.example/signed?token=abc" }, error: null }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result).toEqual({ url: "https://storage.example/signed?token=abc", error: null });
  });

  it("returns a structured error instead of null when Supabase resolves with { error }", async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: "object not found" } }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/object not found/);
  });

  it("catches a thrown/rejected exception instead of propagating it as an unhandled rejection", async () => {
    const supabase = fakeSupabase(async () => {
      throw new Error("network dropped mid-request");
    });
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/network dropped/);
  });

  it("times out instead of hanging forever when the underlying call never settles", async () => {
    vi.useFakeTimers();
    const supabase = fakeSupabase(() => new Promise(() => {})); // never resolves or rejects
    const promise = getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;
    expect(result.url).toBeNull();
    expect(result.error).toBe("timeout");
  });

  it("resolves well before a 25-second hang would be perceptible (regression guard for the reported blank-tab bug)", async () => {
    vi.useFakeTimers();
    const supabase = fakeSupabase(() => new Promise(() => {}));
    const promise = getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    await vi.advanceTimersByTimeAsync(9999);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(true).toBe(true); // reaching here means it settled by 10s, not 25s+
  });

  it("logs nothing on success — the signed URL itself is never written to the console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase(async () => ({ data: { signedUrl: "https://storage.example/signed?token=SUPER-SECRET" }, error: null }));
    await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(spy).not.toHaveBeenCalled();
  });

  it("on failure, logs only the file path and a generic message — never a URL or token", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: "row-level security violation" } }));
    await getSignedFileUrl(supabase, "some-resource-id/file.pdf", "file.pdf");
    expect(errors.length).toBeGreaterThan(0);
    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).toMatch(/some-resource-id\/file\.pdf/);
    expect(joined).not.toMatch(/token=/i);
    expect(joined).not.toMatch(/https?:\/\//);
  });
});
