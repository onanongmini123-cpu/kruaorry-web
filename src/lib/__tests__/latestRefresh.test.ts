import { describe, expect, it, vi } from "vitest";
import { createLatestRefreshRunner } from "../latestRefresh";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("latest refresh runner", () => {
  it("ignores an older response and applies the queued fresh response", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const apply = vi.fn();
    const runner = createLatestRefreshRunner(load, apply);

    const initial = runner.request();
    const focused = runner.request();
    expect(load).toHaveBeenCalledTimes(1);

    first.resolve("stale-free");
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);

    second.resolve("fresh-teacher");
    await Promise.all([initial, focused]);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith("fresh-teacher");
  });

  it("does not apply an in-flight response after disposal", async () => {
    const pending = deferred<string>();
    const apply = vi.fn();
    const runner = createLatestRefreshRunner(() => pending.promise, apply);
    const refresh = runner.request();
    runner.dispose();
    pending.resolve("late");
    await refresh;
    expect(apply).not.toHaveBeenCalled();
  });
});
