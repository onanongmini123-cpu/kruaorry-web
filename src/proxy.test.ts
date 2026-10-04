import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const mockedCreateServerClient = vi.mocked(createServerClient);

beforeEach(() => vi.resetAllMocks());

function mockSession(user: { id: string } | null) {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
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

  it("redirects anonymous application traffic to login with the full return path", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest("https://example.com/app?memberPreview=1"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?next=%2Fapp%3FmemberPreview%3D1",
    );
  });

  it("does not guard public catalogue routes", async () => {
    mockSession(null);
    const response = await proxy(new NextRequest("https://example.com/resources"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends an authenticated visitor away from signup to the member app", async () => {
    mockSession({ id: "member-1" });
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
});
