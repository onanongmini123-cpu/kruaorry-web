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
  it("never resolves a destination for a signed-out visitor", async () => {
    const client = fakeClient(false, { delivery_mode: "google_template", cta_url: "https://docs.google.com/secret", file_path: null, file_name: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("secret");
  });

  it("does not expose a premium destination when the RPC denies access", async () => {
    const client = fakeClient(true, null);
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(new Request(`https://kruaorry.example/api/resources/${id}/open`), params);
    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
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
});
