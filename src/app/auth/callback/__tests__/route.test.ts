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
    expect(response.headers.get("location")).toBe("https://example.com/app");
    expect(response.headers.get("location")).not.toContain("SECRET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("supports a token-hash confirmation link when the Supabase email template uses one", async () => {
    const verifyOtp = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);
    const response = await GET(new Request(`https://example.com/auth/callback?token_hash=SECRET&type=email&next=${encodeURIComponent(`/app?resource=${id}`)}`));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "SECRET", type: "email" });
    expect(response.headers.get("location")).toBe("https://example.com/app");
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
    expect(response.headers.get("location")).toBe("https://example.com/login?next=%2Fapp&error=confirmation");
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
      "https://example.com/login?next=%2Fapp&error=confirmation",
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
      "https://example.com/login?next=%2Fapp&error=confirmation",
    );
    expect(response.headers.get("location")).not.toContain("SECRET");
  });

  it("rejects external redirects, ambiguous credentials and unrelated OTP types", async () => {
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "user-1" } }, error: null }) } } as never);
    const external = await GET(new Request("https://example.com/auth/callback?code=SECRET&next=https://evil.example"));
    expect(external.headers.get("location")).toBe("https://example.com/app");
    const ambiguous = await GET(new Request("https://example.com/auth/callback?code=x&token_hash=y"));
    expect(ambiguous.headers.get("location")).toBe("https://example.com/login?next=%2Fapp&error=confirmation");
    const recovery = await GET(new Request("https://example.com/auth/callback?token_hash=x&type=recovery"));
    expect(recovery.headers.get("location")).toBe("https://example.com/login?next=%2Fapp&error=confirmation");
  });

  it("does not carry even an allowlisted paid destination through signup confirmation", async () => {
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "user-1" } }, error: null }) } } as never);
    const paidNext = `/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`;
    const response = await GET(new Request(`https://example.com/auth/callback?code=SECRET&next=${encodeURIComponent(paidNext)}`));

    expect(response.headers.get("location")).toBe("https://example.com/app");
    expect(response.headers.get("location")).not.toContain("membership");
  });
});
