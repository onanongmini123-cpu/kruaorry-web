import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEntitlements, getSignedFileUrl } from "../data";
import { ASYNC_STAGE_TIMEOUT_MS } from "../asyncTimeout";

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
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const result = await promise;
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/timed out/);
  });

  it("resolves well before a 25-second hang would be perceptible (regression guard for the reported blank-tab bug)", async () => {
    vi.useFakeTimers();
    const supabase = fakeSupabase(() => new Promise(() => {}));
    const promise = getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS - 1);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(true).toBe(true); // reaching here means it settled well under 25s
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

  // Regression test for a real underlying SDK/network error message that
  // happens to embed a signed URL and its token — this must never surface,
  // in either the returned error string or anything logged, not just the
  // one benign message the earlier tests happened to use.
  it("redacts a signed URL and its token embedded in a Supabase-returned error message", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => ({
      data: null,
      error: { message: "upstream request failed: https://xyz.supabase.co/storage/v1/object/sign/resource-files/r1/file.pdf?token=SUPER-SECRET-VALUE" },
    }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");

    expect(result.error).not.toMatch(/SUPER-SECRET-VALUE/);
    expect(result.error).not.toMatch(/https?:\/\//);

    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).not.toMatch(/SUPER-SECRET-VALUE/);
    expect(joined).not.toMatch(/https?:\/\//);
  });

  it("redacts a bearer/JWT-like credential embedded in a thrown exception's message", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => {
      throw new Error("request failed with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
    });
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");

    expect(result.error).not.toMatch(/eyJ/);

    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).not.toMatch(/eyJ/);
  });
});

describe("fetchEntitlements", () => {
  it("converts RPC rows into a keyed capability snapshot", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          { plan_id: "teacher", feature_id: "download.premium", enabled: true, limit_value: null },
          { plan_id: "teacher", feature_id: "favorites.limit", enabled: true, limit_value: 50 },
        ],
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(fetchEntitlements(supabase)).resolves.toEqual({
      planId: "teacher",
      features: {
        "download.premium": { enabled: true, limit: null },
        "favorites.limit": { enabled: true, limit: 50 },
      },
    });
  });

  it("fails closed to free with no capabilities when the RPC fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission denied", code: "42501", details: "", hint: "" },
      }),
    } as unknown as SupabaseClient;

    await expect(fetchEntitlements(supabase)).resolves.toEqual({ planId: "free", features: {} });
  });
});
