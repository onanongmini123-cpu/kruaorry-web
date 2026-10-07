import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const mockedCreateServerClient = vi.mocked(createServerClient);

beforeEach(() => vi.resetAllMocks());

function mockSession(
  user: { id: string; is_anonymous?: boolean } | null,
  error: unknown = null,
) {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error })),
    },
  } as never);
}

function mockRejectedSession() {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => { throw new Error("auth unavailable"); }),
    },
  } as never);
}

describe("application proxy", () => {
  it("preserves an authenticated session when an admin opens member preview", async () => {
    mockSession({ id: "admin-1" });
    const response = await proxy(new NextRequest("https://example.com/app?memberPreview=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("preserves an authenticated session when returning to the admin route", async () => {
    mockSession({ id: "admin-1" });
    const response = await proxy(new NextRequest("https://example.com/admin"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects signed-out application traffic to login with the full return path", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest("https://example.com/app?memberPreview=1"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?next=%2Fapp%3FmemberPreview%3D1",
    );
  });

  it("keeps a Supabase anonymous identity in the guest flow", async () => {
    mockSession({ id: "anonymous-1", is_anonymous: true });

    const login = await proxy(new NextRequest(
      "https://example.com/login?mode=signup&next=%2Fapp",
    ));
    const application = await proxy(new NextRequest(
      "https://example.com/app?resource=worksheet-1",
    ));

    expect(login.status).toBe(200);
    expect(login.headers.get("location")).toBeNull();
    expect(application.headers.get("location")).toBe(
      "https://example.com/login?next=%2Fapp%3Fresource%3Dworksheet-1",
    );
  });

  it("does not guard public catalogue routes", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest("https://example.com/resources"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends an authenticated visitor away from signup to the member app", async () => {
    mockSession({ id: "member-1", is_anonymous: false });
    const response = await proxy(new NextRequest(
      "https://example.com/login?mode=signup&next=%2Fmembership%3Fplan%3Dteacher",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/app");
    expect(config.matcher).toContain("/login");
  });

  it("lets authenticated sign-in resume only an allowlisted destination", async () => {
    mockSession({ id: "member-1" });
    const safe = await proxy(new NextRequest(
      "https://example.com/login?next=%2Fmembership%3Fplan%3Dteacher",
    ));
    const unsafe = await proxy(new NextRequest(
      "https://example.com/login?next=https%3A%2F%2Fevil.example%2Fsteal",
    ));

    expect(safe.headers.get("location")).toBe("https://example.com/membership?plan=teacher");
    expect(unsafe.headers.get("location")).toBe("https://example.com/app");
  });

  it("keeps the login page available to a signed-out visitor", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest(
      "https://example.com/login?mode=signup&next=%2Fapp",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats an expired or unreadable session as a guest", async () => {
    mockSession({ id: "stale-member" }, { message: "session expired" });
    const expired = await proxy(new NextRequest("https://example.com/login?next=%2Fapp"));
    expect(expired.status).toBe(200);
    expect(expired.headers.get("location")).toBeNull();

    mockRejectedSession();
    const unreadable = await proxy(new NextRequest("https://example.com/app"));
    expect(unreadable.headers.get("location")).toBe(
      "https://example.com/login?next=%2Fapp",
    );
  });

  it("runs on server-rendered /resources pages so refreshed sessions are saved", () => {
    expect(config.matcher).toContain("/resources");
    expect(config.matcher).toContain("/resources/:path*");
  });

  it("marks a response that carries refreshed auth cookies as non-cacheable", async () => {
    mockedCreateServerClient.mockImplementation(((_url: string, _key: string, options: {
      cookies: { setAll: (cookies: { name: string; value: string; options: object }[], headers: Record<string, string>) => void };
    }) => ({
      auth: {
        getUser: vi.fn(async () => {
          options.cookies.setAll(
            [{ name: "sb-session", value: "refreshed", options: {} }],
            { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Pragma: "no-cache" },
          );
          return { data: { user: { id: "member-1" } }, error: null };
        }),
      },
    })) as never);

    const response = await proxy(new NextRequest("https://example.com/resources"));

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("never lets a redirect that may carry refreshed cookies be cached", async () => {
    mockedCreateServerClient.mockImplementation(((_url: string, _key: string, options: {
      cookies: { setAll: (cookies: { name: string; value: string; options: object }[], headers: Record<string, string>) => void };
    }) => ({
      auth: {
        getUser: vi.fn(async () => {
          options.cookies.setAll(
            [{ name: "sb-session", value: "refreshed", options: {} }],
            { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" },
          );
          return { data: { user: { id: "member-1" } }, error: null };
        }),
      },
    })) as never);

    // A signed-in member opening /login is sent on to the app with the new cookies.
    const redirect = await proxy(new NextRequest("https://example.com/login"));
    expect(redirect.status).toBe(307);
    expect(redirect.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(redirect.headers.get("cache-control")).toContain("no-store");
    expect(redirect.headers.get("pragma")).toBe("no-cache");
    expect(redirect.headers.get("expires")).toBe("0");
  });

  it("marks the sign-in redirect for a signed-out visitor as non-cacheable too", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest("https://example.com/app"));

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
