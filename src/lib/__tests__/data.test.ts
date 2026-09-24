import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEntitlements, fetchFounderCapacity, fetchPlans, fetchPublishedResources, fetchSavedResourceIds, getSignedFileUrl, setResourceSaved } from "../data";
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

describe("fetchFounderCapacity", () => {
  it("maps the aggregate RPC without exposing member data", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ used: 24, capacity: 100, remaining: 76, is_full: false }],
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(fetchFounderCapacity(supabase)).resolves.toEqual({
      used: 24,
      capacity: 100,
      remaining: 76,
      isFull: false,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("get_founder_capacity");
  });

  it("fails closed when the aggregate is malformed", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [{ user_id: "must-not-leak" }], error: null }),
    } as unknown as SupabaseClient;

    await expect(fetchFounderCapacity(supabase)).resolves.toBeNull();
  });
});

describe("public catalog reads", () => {
  it("uses only the safe catalog view and never requests private destination columns", async () => {
    const rows = [
      { id: "one", title: "แบบฝึกจริง", meta: "", description: "", category: "", delivery_mode: "file_download", cover_image_url: null, tags: [], is_free: true, file_name: "real.pdf", file_size: 100 },
    ];
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    await expect(fetchPublishedResources(client)).resolves.toMatchObject([{ id: "one", title: "แบบฝึกจริง" }]);
    expect(client.from).toHaveBeenCalledWith("resource_catalog");
    expect(query.select).toHaveBeenCalledWith(expect.not.stringMatching(/cta_url|file_path|file_name/));
    expect(query.select).toHaveBeenCalledWith(expect.stringMatching(/grade_levels.*required_plan_names/));
  });

  it("ends a stalled plan request instead of leaving the home page loading forever", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnValue(new Promise(() => {})) };
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    const result = fetchPlans(client);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toEqual([]);
  });
});

describe("setResourceSaved", () => {
  it("returns a write error so the UI does not show a failed save as successful", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Saved resource limit reached", code: "P0001", details: "", hint: "" } });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", true)).resolves.toBe("Saved resource limit reached");
    expect(rpc).toHaveBeenCalledWith("set_my_resource_saved", { p_resource_id: "resource-1", p_saved: true });
  });

  it("returns null after a successful save", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", true)).resolves.toBeNull();
  });

  it("uses the same isolated RPC to remove a saved resource", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", false)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("set_my_resource_saved", { p_resource_id: "resource-1", p_saved: false });
  });

  it("times out so an optimistic bookmark can roll back instead of staying disabled", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = { rpc: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as SupabaseClient;

    const result = setResourceSaved(supabase, "resource-1", true);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toMatch(/timed out/);
  });
});

describe("fetchSavedResourceIds", () => {
  it("paginates a large favorites collection instead of relying on the API row cap", async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ resource_id: `resource-${index}` }));
    const range = vi.fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: [{ resource_id: "resource-500" }], error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    const ids = await fetchSavedResourceIds(supabase, "user-1");
    expect(ids).toHaveLength(501);
    expect(range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("times out a stalled favorites read so member loading can finish", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    const result = fetchSavedResourceIds(supabase, "user-1");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toEqual([]);
  });
});
