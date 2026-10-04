import { describe, expect, it, vi } from "vitest";
import { createLatestRefreshController, createLatestRefreshRunner } from "../latestRefresh";

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

  it("does not leak the previous member response into a new login", async () => {
    const previousMember = deferred<string>();
    const applied: string[] = [];
    const previousRunner = createLatestRefreshRunner(
      () => previousMember.promise,
      (value) => applied.push(value),
    );
    const previousRefresh = previousRunner.request();

    previousRunner.dispose();
    const nextRunner = createLatestRefreshRunner(
      async () => "next-member-teacher",
      (value) => applied.push(value),
    );
    await nextRunner.request();
    previousMember.resolve("previous-member-free");
    await previousRefresh;

    expect(applied).toEqual(["next-member-teacher"]);
  });

  it("synchronously invalidates the current member on logout and keeps a newer login attached", async () => {
    const previousMember = deferred<string>();
    const applied: string[] = [];
    const controller = createLatestRefreshController();
    const previousRunner = createLatestRefreshRunner(
      () => previousMember.promise,
      (value) => applied.push(value),
    );
    controller.attach(previousRunner);
    const previousRefresh = controller.request();

    controller.dispose();
    const nextRunner = createLatestRefreshRunner(
      async () => "next-member-teacher",
      (value) => applied.push(value),
    );
    controller.attach(nextRunner);
    controller.detach(previousRunner);
    await controller.request();

    previousMember.resolve("previous-member-free");
    await previousRefresh;
    expect(applied).toEqual(["next-member-teacher"]);
  });

  it("queues a retry requested just before the effect attaches its runner", async () => {
    const controller = createLatestRefreshController();
    const apply = vi.fn();
    await controller.request();

    controller.attach(createLatestRefreshRunner(async () => "teacher", apply));
    await Promise.resolve();
    await Promise.resolve();

    expect(apply).toHaveBeenCalledWith("teacher");
  });
});
