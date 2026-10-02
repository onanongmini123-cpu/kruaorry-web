import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASYNC_STAGE_TIMEOUT_MS } from "../asyncTimeout";
import {
  fetchMembershipSchemaReadiness,
  MEMBERSHIP_SCHEMA_READINESS_MARKER,
} from "../membershipSchemaReadiness";

function fakeReadinessClient(result: unknown): { client: SupabaseClient; from: ReturnType<typeof vi.fn> } {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("membership schema readiness", () => {
  it("uses only the old-schema features.id capability marker", async () => {
    const { client, from } = fakeReadinessClient({
      data: { id: MEMBERSHIP_SCHEMA_READINESS_MARKER },
      error: null,
    });

    await expect(fetchMembershipSchemaReadiness(client)).resolves.toBe("ready");
    expect(from).toHaveBeenCalledWith("features");
    expect(from).not.toHaveBeenCalledWith("upgrade_requests");
  });

  it("fails closed when the marker is absent or unreadable", async () => {
    const missing = fakeReadinessClient({ data: null, error: null });
    const denied = fakeReadinessClient({ data: null, error: { code: "42501", message: "denied" } });

    await expect(fetchMembershipSchemaReadiness(missing.client)).resolves.toBe("unavailable");
    await expect(fetchMembershipSchemaReadiness(denied.client)).resolves.toBe("unavailable");
  });

  it("fails closed when the client throws while building the probe", async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error("SDK unavailable");
      }),
    } as unknown as SupabaseClient;

    await expect(fetchMembershipSchemaReadiness(client)).resolves.toBe("unavailable");
  });

  it("fails closed when the readiness probe times out", async () => {
    vi.useFakeTimers();
    const maybeSingle = vi.fn(() => new Promise(() => {}));
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    } as unknown as SupabaseClient;

    const result = fetchMembershipSchemaReadiness(client);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toBe("unavailable");
  });
});
