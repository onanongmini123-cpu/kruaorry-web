import { describe, expect, it, vi } from "vitest";
import { persistFavoriteOptimistically } from "../favoriteState";

function stateHarness(initial: string[]) {
  let state = initial;
  const snapshots: string[][] = [];
  const apply = (update: (current: string[]) => string[]) => {
    state = update(state);
    snapshots.push(state);
  };
  return { apply, snapshots, value: () => state };
}

describe("persistFavoriteOptimistically", () => {
  it("adds before waiting for persistence and keeps the saved state on success", async () => {
    const harness = stateHarness([]);
    let resolve!: (value: string | null) => void;
    const persistence = new Promise<string | null>((done) => { resolve = done; });
    const result = persistFavoriteOptimistically("resource-1", true, harness.apply, () => persistence);

    expect(harness.value()).toEqual(["resource-1"]);
    resolve(null);
    await expect(result).resolves.toBeNull();
    expect(harness.snapshots).toEqual([["resource-1"]]);
  });

  it("rolls back only the failed resource and preserves concurrent favorites", async () => {
    const harness = stateHarness(["other"]);
    const result = persistFavoriteOptimistically("resource-1", true, harness.apply, async () => "limit reached");
    harness.apply((current) => [...current, "concurrent"]);

    await expect(result).resolves.toBe("limit reached");
    expect(harness.value()).toEqual(["other", "concurrent"]);
  });

  it("rolls back an optimistic removal when persistence throws", async () => {
    const harness = stateHarness(["resource-1", "other"]);
    const persist = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(persistFavoriteOptimistically("resource-1", false, harness.apply, persist)).resolves.toBe("Favorite request failed");
    expect(harness.value()).toEqual(["other", "resource-1"]);
  });
});
