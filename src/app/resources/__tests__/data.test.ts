import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { loadPublicResources, loadPublicResourceViewer } from "../data";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function profileQuery(role: string | null, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: role ? { role } : null, error })),
      })),
    })),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
});

describe("public resource viewer", () => {
  it("does not query profile or entitlements for a signed-out visitor", async () => {
    const from = vi.fn();
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from,
      rpc,
    } as never);

    await expect(loadPublicResourceViewer()).resolves.toMatchObject({
      authenticated: false,
      role: null,
      entitlements: { planId: "free", features: {} },
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives role and capabilities from the caller's own session", async () => {
    const profile = profileQuery("member");
    const rpc = vi.fn(async () => ({
      data: [
        { plan_id: "teacher", feature_id: "download.premium", enabled: true, limit_value: null },
        { plan_id: "teacher", feature_id: "favorites.limit", enabled: true, limit_value: 50 },
      ],
      error: null,
    }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn(() => profile),
      rpc,
    } as never);

    await expect(loadPublicResourceViewer()).resolves.toEqual({
      authenticated: true,
      role: "member",
      entitlements: {
        planId: "teacher",
        features: {
          "download.premium": { enabled: true, limit: null },
          "favorites.limit": { enabled: true, limit: 50 },
        },
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_entitlements");
  });

  it("fails closed when the authenticated session lookup throws", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("network token=SECRET"));

    await expect(loadPublicResourceViewer()).resolves.toMatchObject({
      authenticated: false,
      role: null,
      entitlements: { planId: "free", features: {} },
    });
  });
});

describe("public resource listing", () => {
  it("orders newest publication first while keeping undated legacy rows last", async () => {
    const range = vi.fn(async () => ({ data: [], error: null }));
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    };
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(() => query),
    } as never);

    await expect(loadPublicResources()).resolves.toEqual({ status: "ready", resources: [] });
    expect(query.order).toHaveBeenNthCalledWith(1, "published_at", { ascending: false, nullsFirst: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });
});
