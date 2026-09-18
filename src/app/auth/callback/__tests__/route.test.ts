import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

const mockedCreateClient = vi.mocked(createClient);
const id = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => vi.resetAllMocks());

describe("GET /auth/callback", () => {
  it("exchanges a PKCE code and returns to the intended file without leaking the code", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession } } as never);
    const next = `/download/${id}?name=${encodeURIComponent("ใบงาน.pdf")}&autoclose=1`;
    const response = await GET(new Request(`https://example.com/auth/callback?code=SECRET&next=${encodeURIComponent(next)}`));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("SECRET", undefined);
    expect(response.headers.get("location")).toBe(`https://example.com${next}`);
    expect(response.headers.get("location")).not.toContain("SECRET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("supports a token-hash confirmation link when the Supabase email template uses one", async () => {
    const verifyOtp = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    mockedCreateClient.mockResolvedValue({ auth: { verifyOtp } } as never);
    const response = await GET(new Request(`https://example.com/auth/callback?token_hash=SECRET&type=email&next=${encodeURIComponent(`/app?resource=${id}`)}`));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "SECRET", type: "email" });
    expect(response.headers.get("location")).toBe(`https://example.com/app?resource=${id}`);
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
    expect(response.headers.get("location")).toBe(`https://example.com/login?next=${encodeURIComponent(`/download/${id}`)}&error=confirmation`);
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
});
