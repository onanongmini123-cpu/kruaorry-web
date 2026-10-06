import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

const id = "11111111-2222-4333-8444-555555555555";
const params = { params: Promise.resolve({ id }) };

function fakeClient(user: boolean, target: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user: user ? { id: "u1" } : null } }) },
    rpc: vi.fn(() => ({ maybeSingle: async () => ({ data: target, error: null }) })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("authorized external resource opener", () => {
  it("lets the server resolver open an explicitly public destination for a signed-out visitor", async () => {
    const client = fakeClient(false, { delivery_mode: "google_template", cta_url: "https://docs.google.com/document/d/public/copy", file_path: null, file_name: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(302);
    expect(client.rpc).toHaveBeenCalledWith("resolve_resource_target", { p_resource_id: id });
    expect(response.headers.get("location")).toBe("https://docs.google.com/document/d/public/copy");
  });

  it("fails safely without exposing a destination when the RPC denies a signed-out visitor", async () => {
    const client = fakeClient(false, null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(403);
    expect(client.rpc).toHaveBeenCalledWith("resolve_resource_target", { p_resource_id: id });
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("blocks a copied premium open URL for a signed-in Free member", async () => {
    // The database resolver returns no row for a Free member requesting a
    // plans-only resource; the route must not carry a client-side bypass.
    const client = fakeClient(true, null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("resolve_resource_target", { p_resource_id: id });
  });

  it("opens an authorized external destination only after server resolution", async () => {
    const client = fakeClient(true, { delivery_mode: "google_template", cta_url: "https://docs.google.com/document/d/valid/copy", file_path: null, file_name: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(client.rpc).toHaveBeenCalledWith("resolve_resource_target", { p_resource_id: id });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://docs.google.com/document/d/valid/copy");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("preserves an authenticated free resource when the resolver authorizes it", async () => {
    const client = fakeClient(true, { delivery_mode: "web_app", cta_url: "/free-tool", file_path: null, file_name: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://kruaorry.example/free-tool");
  });

  it("rejects unsafe URLs and file mode rather than redirecting", async () => {
    for (const target of [
      { delivery_mode: "web_app", cta_url: "javascript:alert(1)", file_path: null, file_name: null },
      { delivery_mode: "web_app", cta_url: "//evil.example/path", file_path: null, file_name: null },
      { delivery_mode: "file_download", cta_url: "https://docs.google.com/valid", file_path: "r/file.pdf", file_name: "file.pdf" },
    ]) {
      vi.mocked(createClient).mockResolvedValue(fakeClient(true, target) as never);
      const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("gives a denied visitor a friendly page with a way forward and no destination", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeClient(false, null) as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    const body = await response.text();
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain(`href="/resources/${id}"`);
    expect(body).toContain("ต้องเข้าสู่ระบบหรือมีสิทธิ์ใช้งานก่อน");
    expect(body).not.toMatch(/Supabase|RLS|JWT|null|rpc/i);
  });

  it("offers a retry link when the server cannot resolve the resource", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain("ลองใหม่");
    expect(body).toContain(`href="/api/resources/${id}/open"`);
    expect(body).not.toContain("ECONNREFUSED");
  });

  it("answers a malformed id with a friendly 404 page", async () => {
    const response = await GET(
      new Request("https://kruaorry.example/api/resources/not-a-uuid/open"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toContain('href="/resources"');
  });
});
