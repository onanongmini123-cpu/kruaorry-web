import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/quickRaceGame", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/quickRaceGame")>();
  return { ...actual, renderQuickRaceGame: vi.fn() };
});

import { createClient } from "@/lib/supabase/server";
import { renderQuickRaceGame } from "@/server/quickRaceGame";
import { GET } from "./route";

const mockedCreateClient = vi.mocked(createClient);
const mockedRender = vi.mocked(renderQuickRaceGame);
const request = () => new Request("https://example.com/app/games/quick-race");

function mockSupabase(
  user: { id: string; is_anonymous?: boolean } | null,
  target: { delivery_mode: string; cta_url: string | null; file_path: string | null; file_name: string | null } | null = null,
  options: { authError?: Error; accessError?: Error } = {},
) {
  const maybeSingle = vi.fn(async () => ({ data: target, error: options.accessError ?? null }));
  const rpc = vi.fn(() => ({ maybeSingle }));
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: options.authError ?? null,
      })),
    },
    rpc,
  } as never);
  return { rpc, maybeSingle };
}

const validTarget = {
  delivery_mode: "web_app",
  cta_url: "/app/games/quick-race",
  file_path: null,
  file_name: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedRender.mockResolvedValue("<!doctype html><title>รถแข่งตอบไว</title>");
});

describe("GET /app/games/quick-race", () => {
  it.each([
    ["missing user", null, undefined],
    ["Supabase anonymous user", { id: "guest", is_anonymous: true }, undefined],
    ["stale or invalid session", null, new Error("invalid session")],
  ])("redirects %s without serving game bytes", async (_label, user, authError) => {
    mockSupabase(user, null, { authError });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?next=%2Fapp%2Fgames%2Fquick-race",
    );
    expect(await response.text()).toBe("");
    expect(mockedRender).not.toHaveBeenCalled();
  });

  it.each([
    ["missing entitlement", null, undefined],
    ["resolver error", null, new Error("database unavailable")],
    ["retargeted row", { ...validTarget, cta_url: "/app" }, undefined],
    ["unexpected download", { ...validTarget, file_path: "private/game.zip" }, undefined],
  ])("fails closed for %s", async (_label, target, accessError) => {
    mockSupabase({ id: "member-1" }, target, { accessError });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("รถแข่งตอบไว");
    expect(mockedRender).not.toHaveBeenCalled();
  });

  it("serves the inlined game only for an authorized real account", async () => {
    const { rpc } = mockSupabase({ id: "free-member" }, validTarget);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("รถแข่งตอบไว");
    expect(rpc).toHaveBeenCalledWith("resolve_resource_target", {
      p_resource_id: "70c9b34d-00d8-4524-b9c5-766b45c7152a",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
  });

  it("returns no game bytes if the server bundle cannot be loaded", async () => {
    mockSupabase({ id: "member-1" }, validTarget);
    mockedRender.mockRejectedValue(new Error("missing bundle"));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("รถแข่งตอบไว");
  });
});
