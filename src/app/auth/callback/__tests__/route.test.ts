import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

const mockedCreateClient = vi.mocked(createClient);
const id = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => vi.resetAllMocks());

describe("GET /auth/callback", () => {
  it("exchanges a PKCE code and finishes signup at /app without leaking the code", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession } } as never);
    const next = `/download/${id}?name=${encodeURIComponent("ใบงาน.pdf")}&autoclose=1`;
    const response = await GET(new Request(`https://example.com/auth/callback?code=SECRET&next=${encodeURIComponent(next)}`));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("SECRET", undefined);
    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(response.headers.get("location")).not.toContain("SECRET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("supports a token-hash confirmation link when the Supabase email template uses one", async () => {
    const verifyOtp = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);
    const response = await GET(new Request(`https://example.com/auth/callback?token_hash=SECRET&type=email&next=${encodeURIComponent(`/app?resource=${id}`)}`));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "SECRET", type: "email" });
    expect(response.headers.get("location")).toBe("https://example.com/");
  });

  it("passes the PKCE flow id through when Supabase includes one", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession } } as never);
    await GET(new Request("https://example.com/auth/callback?code=SECRET&sb_flow_id=flow-1"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("SECRET", { flowId: "flow-1" });
  });

  it("falls back to the login page on expired code, without echoing provider text", async () => {
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: null }, error: { message: "SECRET" } }) } } as never);
    const response = await GET(new Request(`https://example.com/auth/callback?code=SECRET&next=${encodeURIComponent(`/download/${id}`)}`));
    expect(response.headers.get("location")).toBe("https://example.com/login?next=%2F&error=confirmation");
    expect(response.headers.get("location")).not.toContain("SECRET");
  });

  it("does not complete confirmation with a Supabase anonymous identity", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: async () => ({
          data: { user: { id: "anonymous-1", is_anonymous: true } },
          error: null,
        }),
      },
    } as never);

    const response = await GET(new Request(
      "https://example.com/auth/callback?code=SECRET&next=https%3A%2F%2Fevil.example",
    ));

    expect(response.headers.get("location")).toBe(
      "https://example.com/login?next=%2F&error=confirmation",
    );
    expect(response.headers.get("location")).not.toContain("SECRET");
    expect(response.headers.get("location")).not.toContain("evil.example");
  });

  it("also rejects an anonymous identity from token-hash confirmation", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        verifyOtp: async () => ({
          data: { user: { id: "anonymous-1", is_anonymous: true } },
          error: null,
        }),
      },
    } as never);

    const response = await GET(new Request(
      "https://example.com/auth/callback?token_hash=SECRET&type=email",
    ));

    expect(response.headers.get("location")).toBe(
      "https://example.com/login?next=%2F&error=confirmation",
    );
    expect(response.headers.get("location")).not.toContain("SECRET");
  });

  it("rejects external redirects, ambiguous credentials and unrelated OTP types", async () => {
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "user-1" } }, error: null }) } } as never);
    const external = await GET(new Request("https://example.com/auth/callback?code=SECRET&next=https://evil.example"));
    expect(external.headers.get("location")).toBe("https://example.com/");
    const ambiguous = await GET(new Request("https://example.com/auth/callback?code=x&token_hash=y"));
    expect(ambiguous.headers.get("location")).toBe("https://example.com/login?next=%2F&error=confirmation");
    const recovery = await GET(new Request("https://example.com/auth/callback?token_hash=x&type=recovery"));
    expect(recovery.headers.get("location")).toBe("https://example.com/login?next=%2F&error=confirmation");
  });

  it("does not carry even an allowlisted paid destination through signup confirmation", async () => {
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "user-1" } }, error: null }) } } as never);
    const paidNext = `/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`;
    const response = await GET(new Request(`https://example.com/auth/callback?code=SECRET&next=${encodeURIComponent(paidNext)}`));

    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(response.headers.get("location")).not.toContain("membership");
  });

  describe("returning a visitor who chose a plan to /membership", () => {
    const confirm = async (metadata: unknown, query = "code=SECRET") => {
      const exchangeCodeForSession = vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: metadata } }, error: null }));
      mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession } } as never);
      return GET(new Request(`https://example.com/auth/callback?${query}`));
    };

    it("goes back to the remembered membership page after the code is exchanged", async () => {
      const response = await confirm({ full_name: "ครู", membership_next: "/membership?plan=teacher&returnTo=%2Fapp" });
      expect(response.headers.get("location")).toBe("https://example.com/membership?plan=teacher&returnTo=%2Fapp");
      expect(response.headers.get("location")).not.toContain("SECRET");
    });

    it("works for a token-hash confirmation link too", async () => {
      const verifyOtp = vi.fn(async () => ({ data: { user: { id: "user-1", user_metadata: { membership_next: "/membership?plan=founder" } } }, error: null }));
      mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);
      const response = await GET(new Request("https://example.com/auth/callback?token_hash=SECRET&type=email"));
      expect(response.headers.get("location")).toBe("https://example.com/membership?plan=founder");
    });

    it("anything outside the membership allowlist falls back to /app (no open redirect)", async () => {
      for (const evil of [
        "https://evil.example", "//evil.example/membership", "/admin", "/app", `/download/${id}`, "/membership?plan=teacher&x=1",
        "/membership?plan=admin", "/membership/../admin", "javascript:alert(1)", "/membership?plan=teacher&returnTo=https%3A%2F%2Fevil.example",
        42, null, { nested: "/membership" }, ["/membership"],
      ]) {
        const response = await confirm({ membership_next: evil });
        expect(response.headers.get("location"), String(JSON.stringify(evil))).toBe("https://example.com/");
      }
    });

    it("no remembered plan (or no metadata) → /app, as before", async () => {
      expect((await confirm({ full_name: "ครู" })).headers.get("location")).toBe("https://example.com/");
      expect((await confirm(undefined)).headers.get("location")).toBe("https://example.com/");
    });

    it("never takes the destination from the callback URL itself", async () => {
      const response = await confirm({}, `code=SECRET&next=${encodeURIComponent("/membership?plan=teacher")}&membership_next=${encodeURIComponent("/membership?plan=teacher")}`);
      expect(response.headers.get("location")).toBe("https://example.com/");
    });

    it("a failed confirmation still goes to the login page, never to the remembered page", async () => {
      mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "u", user_metadata: { membership_next: "/membership?plan=teacher" } } }, error: { message: "x" } }) } } as never);
      const response = await GET(new Request("https://example.com/auth/callback?code=SECRET"));
      expect(response.headers.get("location")).toBe("https://example.com/login?next=%2F&error=confirmation");
    });
  });
});
