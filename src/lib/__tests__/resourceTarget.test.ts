import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResourceTarget, parseResourceTarget } from "../resourceTarget";

function clientWith(data: unknown, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ maybeSingle });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const target = { delivery_mode: "file_download", cta_url: null, file_path: "id/file.pdf", file_name: "file.pdf" };

describe("guarded resource target for administrator edit, publish and delete", () => {
  it("reads a valid private file/link only through the entitlement RPC", async () => {
    const { client, rpc } = clientWith(target);
    expect(await loadResourceTarget(client, "resource-1")).toEqual({ target, error: null });
    expect(rpc).toHaveBeenCalledWith("resolve_resource_target", { p_resource_id: "resource-1" });
  });

  it("fails closed when the RPC denies the row, errors or throws", async () => {
    expect((await loadResourceTarget(clientWith(null).client, "r")).target).toBeNull();
    expect((await loadResourceTarget(clientWith(null, { message: "permission denied" }).client, "r")).error).toBe("permission denied");
    const client = { rpc: () => ({ maybeSingle: () => Promise.reject(new Error("network")) }) } as unknown as SupabaseClient;
    expect((await loadResourceTarget(client, "r")).target).toBeNull();
  });

  it("rejects malformed RPC rows before they reach a redirect or cleanup", () => {
    expect(parseResourceTarget({ ...target, file_path: { secret: true } })).toBeNull();
    expect(parseResourceTarget({ ...target, delivery_mode: "unknown" })).toBeNull();
  });
});
