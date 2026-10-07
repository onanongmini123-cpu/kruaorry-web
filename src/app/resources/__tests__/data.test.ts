import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: vi.fn() }));
// Real caching needs a request context; the loader logic is what is under test.
vi.mock("next/cache", () => ({ unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));

import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { loadPublicResources, loadPublicResourceViewer, loadRelatedResources, resolvePublicResource } from "../data";

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

function pendingUpgradeQuery(planIds: string[] = [], error: unknown = null) {
  const limit = vi.fn(async () => ({ data: planIds.map((plan_id) => ({ plan_id })), error }));
  const statusFilter = { eq: vi.fn(() => ({ limit })) };
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => statusFilter),
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

  it("treats a Supabase anonymous identity as a guest without loading member data", async () => {
    const from = vi.fn();
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "anonymous-1", is_anonymous: true } } })) },
      from,
      rpc,
    } as never);

    await expect(loadPublicResourceViewer()).resolves.toEqual({
      authenticated: false,
      role: null,
      entitlements: { planId: "free", features: {} },
      pendingPlanIds: [],
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats stale user data returned with an auth error as a guest", async () => {
    const from = vi.fn();
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "stale-member" } },
          error: { message: "session expired" },
        })),
      },
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
    const pending = pendingUpgradeQuery(["founder", "founder"]);
    const rpc = vi.fn(async () => ({
      data: [
        { plan_id: "teacher", feature_id: "download.premium", enabled: true, limit_value: null },
        { plan_id: "teacher", feature_id: "favorites.limit", enabled: true, limit_value: 50 },
      ],
      error: null,
    }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => table === "profiles" ? profile : pending),
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
      pendingPlanIds: ["founder"],
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

const ID_A = "11111111-2222-4333-8444-555555555555";
const ID_B = "22222222-3333-4444-8555-666666666666";

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "published",
    title: `สื่อ ${id.slice(0, 4)}`,
    meta: "",
    description: "",
    category: "ภาษาอังกฤษ",
    delivery_mode: "web_app",
    cover_image_url: null,
    tags: ["เกม"],
    grade_levels: ["p1"],
    access_mode: "public",
    required_plan_ids: [],
    required_plan_names: [],
    is_free: true,
    is_new: false,
    featured_rank: null,
    review_average: null,
    review_count: 0,
    ...over,
  };
}

/** A fake anon client whose catalogue query answers from `answer(select)`. */
function anonCatalog(answer: (select: string) => { data: unknown[] | null; error: unknown }) {
  const selects: string[] = [];
  const query = {
    select: vi.fn((select: string) => { selects.push(select); return query; }),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(async () => answer(selects[selects.length - 1])),
  };
  vi.mocked(createAnonClient).mockReturnValue({ from: vi.fn(() => query) } as never);
  return { query, selects };
}

describe("public resource listing", () => {
  it("orders newest publication first while keeping undated legacy rows last", async () => {
    const { query } = anonCatalog(() => ({ data: [], error: null }));

    await expect(loadPublicResources()).resolves.toEqual({ status: "ready", resources: [] });
    expect(query.order).toHaveBeenNthCalledWith(1, "published_at", { ascending: false, nullsFirst: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("reads with the anonymous client, never the visitor's session", async () => {
    vi.mocked(createClient).mockClear();
    anonCatalog(() => ({ data: [row(ID_A)], error: null }));
    await loadPublicResources();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps working before the slug migration: retries without the slug column", async () => {
    const { selects } = anonCatalog((select) => (
      /\bslug\b/.test(select)
        ? { data: null, error: { code: "42703", message: "column resource_catalog.slug does not exist" } }
        : { data: [row(ID_A)], error: null }
    ));

    const result = await loadPublicResources();
    expect(result.status).toBe("ready");
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].slug).toBeNull();
    expect(selects).toHaveLength(2);
    expect(selects[0]).toMatch(/\bslug\b/);
    expect(selects[1]).not.toMatch(/\bslug\b/);
  });

  it("does not hide a real outage behind the slug fallback", async () => {
    anonCatalog(() => ({ data: null, error: { code: "57P01", message: "terminating connection" } }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadPublicResources()).resolves.toEqual({ status: "unavailable", resources: [] });
  });

  it("is unavailable, not an error, when Supabase is not configured", async () => {
    vi.mocked(createAnonClient).mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadPublicResources()).resolves.toEqual({ status: "unavailable", resources: [] });
  });
});

describe("resolving a resource by URL key", () => {
  it("serves a UUID address as-is while no slug exists", async () => {
    anonCatalog((select) => (/\bslug\b/.test(select)
      ? { data: null, error: { code: "42703", message: "column resource_catalog.slug does not exist" } }
      : { data: [row(ID_A)], error: null }));
    const lookup = await resolvePublicResource(ID_A);
    expect(lookup).toMatchObject({ status: "found", canonicalPath: `/resources/${ID_A}`, redirectTo: null });
  });

  it("redirects a UUID to the slug once one exists, and serves the slug directly", async () => {
    anonCatalog(() => ({ data: [row(ID_A, { slug: "sentence-train" })], error: null }));
    expect(await resolvePublicResource(ID_A)).toMatchObject({
      status: "found",
      canonicalPath: "/resources/sentence-train",
      redirectTo: "/resources/sentence-train",
    });
    expect(await resolvePublicResource("sentence-train")).toMatchObject({
      status: "found",
      canonicalPath: "/resources/sentence-train",
      redirectTo: null,
    });
  });

  it("normalizes casing to the canonical slug with a redirect", async () => {
    anonCatalog(() => ({ data: [row(ID_A, { slug: "sentence-train" })], error: null }));
    expect(await resolvePublicResource("Sentence-Train")).toMatchObject({ status: "found", redirectTo: "/resources/sentence-train" });
    expect(await resolvePublicResource(ID_A.toUpperCase())).toMatchObject({ status: "found", redirectTo: "/resources/sentence-train" });
  });

  it("answers not_found for unknown, malformed or look-alike keys without hitting the database", async () => {
    anonCatalog(() => ({ data: [row(ID_A, { slug: "sentence-train" })], error: null }));
    for (const key of ["unknown-slug", ID_B, "..%2Fetc", "a", "ไทย", "x".repeat(200), "11111111-2222-4333-8444-55555555555"]) {
      expect(await resolvePublicResource(key), key).toEqual({ status: "not_found" });
    }
  });

  it("reports unavailable (not not_found) when the catalogue cannot be read", async () => {
    anonCatalog(() => ({ data: null, error: { code: "57P01", message: "boom" } }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resolvePublicResource(ID_A)).toEqual({ status: "unavailable" });
  });

  it("ignores an invalid stored slug and keeps the UUID address", async () => {
    anonCatalog(() => ({ data: [row(ID_A, { slug: "Not A Slug!" })], error: null }));
    expect(await resolvePublicResource(ID_A)).toMatchObject({ canonicalPath: `/resources/${ID_A}`, redirectTo: null });
  });
});

describe("related resources", () => {
  it("returns open, similar resources and never the page's own or a locked one", async () => {
    anonCatalog(() => ({
      data: [
        row(ID_A, { slug: "a-game", tags: ["เกม", "คำศัพท์"] }),
        row(ID_B, { tags: ["เกม", "คำศัพท์"] }),
        row("33333333-4444-4555-8666-777777777777", { tags: ["เกม", "คำศัพท์"], access_mode: "locked" }),
      ],
      error: null,
    }));
    const lookup = await resolvePublicResource("a-game");
    if (lookup.status !== "found") throw new Error("expected found");
    const related = await loadRelatedResources(lookup.resource);
    expect(related.map((item) => item.id)).toEqual([ID_B]);
  });

  it("is empty rather than failing when the catalogue is unavailable", async () => {
    anonCatalog(() => ({ data: null, error: { code: "57P01", message: "boom" } }));
    const stub = { id: ID_A, title: "x", category: "", tags: [], gradeLevels: [], deliveryMode: "web_app", featuredRank: null, accessMode: "public" };
    expect(await loadRelatedResources(stub as never)).toEqual([]);
  });
});
