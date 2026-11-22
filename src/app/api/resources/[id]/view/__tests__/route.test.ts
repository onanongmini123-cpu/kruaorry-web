import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const cookieJar = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: (name: string) => (name === "kru_vid" && cookieJar.value ? { value: cookieJar.value } : undefined) })) }));

import { createClient } from "@/lib/supabase/server";
import { POST } from "../route";

const id = "11111111-2222-4333-8444-555555555555";
const params = { params: Promise.resolve({ id }) };
const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const KEY = "0123456789abcdef0123456789abcdef";
const req = (headers: Record<string, string> = { "user-agent": CHROME }) => new Request(`https://kruaorry.example/api/resources/${id}/view`, { method: "POST", headers });

function client(options: { user?: { id: string } | null; role?: unknown; roleError?: boolean; rpcError?: boolean } = {}) {
  const rpc = vi.fn(async () => ({ data: null, error: options.rpcError ? { message: "boom" } : null }));
  const profileQuery = { select: vi.fn(() => profileQuery), eq: vi.fn(() => profileQuery), maybeSingle: async () => ({ data: options.roleError ? null : { role: options.role ?? "member" }, error: options.roleError ? { message: "denied" } : null }) };
  const from = vi.fn(() => profileQuery);
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: options.user ?? null }, error: null }) }, from, rpc } as never);
  return { rpc, from };
}

afterEach(() => { vi.restoreAllMocks(); vi.mocked(createClient).mockReset(); cookieJar.value = undefined; });

describe("view recording route", () => {
  it("answers 204 and does nothing for a malformed id, a bot, a missing user agent or a prefetch", async () => {
    for (const request of [req({ "user-agent": "Googlebot/2.1" }), req({}), req({ "user-agent": CHROME, "sec-purpose": "prefetch" })]) {
      expect((await POST(request, params)).status).toBe(204);
    }
    expect((await POST(req(), { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(204);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("counts a signed-out visitor once, with a fresh random key, and sets the viewer cookie", async () => {
    const { rpc } = client();
    const response = await POST(req(), params);
    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { p_resource_id: string; p_viewer_key: string }];
    expect(name).toBe("record_resource_view");
    expect(args.p_resource_id).toBe(id);
    expect(args.p_viewer_key).toMatch(/^[0-9a-f]{32}$/);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`kru_vid=${args.p_viewer_key}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the same viewer key for a returning visitor (no new cookie) and replaces a malformed cookie", async () => {
    cookieJar.value = KEY;
    const first = client();
    const response = await POST(req(), params);
    expect((first.rpc.mock.calls[0] as unknown as [string, { p_viewer_key: string }])[1].p_viewer_key).toBe(KEY);
    expect(response.headers.get("set-cookie")).toBeNull();

    cookieJar.value = "tampered";
    const second = client();
    const replaced = await POST(req(), params);
    const key = (second.rpc.mock.calls[0] as unknown as [string, { p_viewer_key: string }])[1].p_viewer_key;
    expect(key).not.toBe("tampered");
    expect(replaced.headers.get("set-cookie")).toContain(`kru_vid=${key}`);
  });

  it("counts a signed-in member", async () => {
    const { rpc } = client({ user: { id: "u1" }, role: "member" });
    expect((await POST(req(), params)).status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("skips admins and owners entirely: nothing stored and no cookie issued", async () => {
    for (const role of ["admin", "owner"]) {
      const { rpc } = client({ user: { id: "u1" }, role });
      const response = await POST(req(), params);
      expect(response.status).toBe(204);
      expect(rpc).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("fails closed when the role cannot be read (an admin must never be counted by accident)", async () => {
    const { rpc } = client({ user: { id: "u1" }, roleError: true });
    expect((await POST(req(), params)).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never fails the page: a database error or a thrown error still answers 204 and sets no cookie", async () => {
    client({ rpcError: true });
    const failed = await POST(req(), params);
    expect(failed.status).toBe(204);
    expect(failed.headers.get("set-cookie")).toBeNull();

    vi.mocked(createClient).mockRejectedValue(new Error("no client"));
    expect((await POST(req(), params)).status).toBe(204);
  });
});
