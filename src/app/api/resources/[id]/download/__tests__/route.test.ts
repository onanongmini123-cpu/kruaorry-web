import { describe, expect, it, vi, afterEach } from "vitest";
import { ASYNC_STAGE_TIMEOUT_MS } from "@/lib/asyncTimeout";

// The route imports createClient from @/lib/supabase/server, which itself
// calls next/headers' cookies() — unavailable outside a real Next.js
// request context. Mocking the whole module keeps this a pure unit test:
// next/headers is never actually loaded.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

interface FakeSupabaseOptions {
  getUserImpl?: () => Promise<{ data: { user: { id: string } | null } }>;
  resourceImpl?: () => Promise<{ data: { delivery_mode: string; cta_url: string | null; file_path: string | null; file_name: string | null } | null; error: { message: string } | null }>;
  signedUrlImpl?: () => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
}

function fakeSupabase(opts: FakeSupabaseOptions) {
  return {
    auth: {
      getUser: opts.getUserImpl ?? (async () => ({ data: { user: { id: "user-1" } } })),
    },
    rpc: () => ({
      maybeSingle: opts.resourceImpl ?? (async () => ({ data: { delivery_mode: "file_download", cta_url: null, file_path: "r1/file.pdf", file_name: "file.pdf" }, error: null })),
    }),
    storage: {
      from: () => ({
        createSignedUrl: opts.signedUrlImpl ?? (async () => ({ data: { signedUrl: "https://storage.example/signed?token=abc" }, error: null })),
      }),
    },
  };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const RESOURCE_ID = "11111111-2222-4333-8444-555555555555";

function resourceRequest() {
  return new Request(`http://localhost/api/resources/${RESOURCE_ID}/download`);
}

const mockedCreateClient = vi.mocked(createClient);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/resources/[id]/download", () => {
  it("redirects to the signed URL on success, with no-store and no-referrer headers", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({}) as never);
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/signed?token=abc");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns a Thai 401 error page when there is no signed-in user", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({
      getUserImpl: async () => ({ data: { user: null } }),
      resourceImpl: async () => ({ data: null, error: null }),
    }) as never);
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toMatch(/เข้าสู่ระบบ/);
    expect(body).toContain(`href="/login?next=%2Fdownload%2F${RESOURCE_ID}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a malformed resource id before creating a Supabase client", async () => {
    mockedCreateClient.mockClear();
    mockedCreateClient.mockResolvedValue(fakeSupabase({
      getUserImpl: async () => ({ data: { user: null } }),
      resourceImpl: async () => ({ data: null, error: null }),
    }) as never);
    const response = await GET(new Request("http://localhost/api/resources/bad/download"), makeParams('bad"><script>alert(1)</script>'));
    const body = await response.text();
    expect(response.status).toBe(404);
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toMatch(/ไม่พบไฟล์/);
  });

  it("returns a Thai 404 error page when the resource lookup returns an error (e.g. RLS filtered it out)", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ resourceImpl: async () => ({ data: null, error: { message: "no rows returned" } }) }) as never);
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toMatch(/ไม่พบไฟล์/);
  });

  it("returns a Thai 404 error page when the resource has no file_path", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ resourceImpl: async () => ({ data: { delivery_mode: "file_download", cta_url: null, file_path: null, file_name: null }, error: null }) }) as never);
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(404);
  });

  it("does not let an auth lookup exception block a resource the server resolver marks public", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        getUserImpl: async () => {
          throw new Error("network dropped");
        },
      }) as never,
    );
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/signed?token=abc");
  });

  it("does not let an auth lookup timeout block a resource the server resolver marks public", async () => {
    vi.useFakeTimers();
    mockedCreateClient.mockResolvedValue(fakeSupabase({ getUserImpl: () => new Promise(() => {}) }) as never);
    const responsePromise = GET(resourceRequest(), makeParams(RESOURCE_ID));
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const response = await responsePromise;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/signed?token=abc");
  });

  it("fails closed to the login path when auth lookup fails and the resolver denies access", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        getUserImpl: async () => {
          throw new Error("network dropped");
        },
        resourceImpl: async () => ({ data: null, error: null }),
      }) as never,
    );
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(401);
    expect(await response.text()).toContain(`href="/login?next=%2Fdownload%2F${RESOURCE_ID}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a Thai error page (not Next's generic 500) when the resource lookup throws", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        resourceImpl: async () => {
          throw new Error("connection reset");
        },
      }) as never,
    );
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toMatch(/ดาวน์โหลดไม่สำเร็จ/);
  });

  it("returns a Thai error page (not a hang) when the resource lookup never settles", async () => {
    vi.useFakeTimers();
    mockedCreateClient.mockResolvedValue(fakeSupabase({ resourceImpl: () => new Promise(() => {}) }) as never);
    const responsePromise = GET(resourceRequest(), makeParams(RESOURCE_ID));
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const response = await responsePromise;
    expect(response.status).toBe(500);
  });

  it("returns a Thai 500 error page when signing the URL fails", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ signedUrlImpl: async () => ({ data: null, error: { message: "object not found" } }) }) as never);
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toMatch(/สร้างลิงก์ดาวน์โหลดไม่สำเร็จ/);
  });

  it("returns a Thai 500 error page (not a hang) when signing the URL never settles", async () => {
    vi.useFakeTimers();
    mockedCreateClient.mockResolvedValue(fakeSupabase({ signedUrlImpl: () => new Promise(() => {}) }) as never);
    const responsePromise = GET(resourceRequest(), makeParams(RESOURCE_ID));
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const response = await responsePromise;
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toMatch(/สร้างลิงก์ดาวน์โหลดไม่สำเร็จ/);
  });

  it("every error response is HTML with no-store and no-referrer headers, and never echoes a token", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ signedUrlImpl: async () => ({ data: null, error: { message: "https://x/y?token=SUPER-SECRET" } }) }) as never,
    );
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.text();
    expect(body).not.toMatch(/SUPER-SECRET/);
    expect(body).not.toMatch(/https?:\/\//);
  });

  it("returns a Thai error page when createClient() itself throws", async () => {
    mockedCreateClient.mockRejectedValue(new Error("cookies() unavailable"));
    const response = await GET(resourceRequest(), makeParams(RESOURCE_ID));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toMatch(/เกิดข้อผิดพลาด/);
  });
});
