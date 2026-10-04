import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ASYNC_STAGE_TIMEOUT_MS } from "../asyncTimeout";
import {
  initialPublicAuthState,
  observePublicAuthState,
  publicFreeAccountAction,
  publicHeaderActions,
} from "../publicAuthState";

type Auth = SupabaseClient["auth"];
type AuthCallback = Parameters<Auth["onAuthStateChange"]>[0];

const MEMBER_USER: User = {
  id: "member",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-10-04T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function authHarness() {
  const userRequest = deferred<Awaited<ReturnType<Auth["getUser"]>>>();
  const unsubscribe = vi.fn();
  let callback: AuthCallback | null = null;
  const auth = {
    getUser: vi.fn(() => userRequest.promise),
    onAuthStateChange: vi.fn((nextCallback: AuthCallback) => {
      callback = nextCallback;
      return { data: { subscription: { id: "public-home", callback: nextCallback, unsubscribe } } };
    }),
  } as unknown as Auth;

  return {
    auth,
    userRequest,
    unsubscribe,
    emit: (event: Parameters<AuthCallback>[0], user: User | null) => {
      if (!callback) throw new Error("Auth callback is not installed");
      callback(event, user ? {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user,
      } : null);
    },
  };
}

describe("public-home auth state", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in checking when Supabase is configured so guest CTAs cannot flash", () => {
    expect(initialPublicAuthState(true)).toBe("checking");
    expect(initialPublicAuthState(false)).toBe("guest");
    expect(publicHeaderActions("checking")).toEqual([]);
    expect(publicFreeAccountAction("checking")).toBeNull();
  });

  it("keeps the existing guest routes and sends members only to their app", () => {
    expect(publicHeaderActions("guest")).toEqual([
      { href: "/login", label: "เข้าสู่ระบบ", emphasis: "ghost" },
      { href: "/login?mode=signup&next=%2Fapp", label: "สมัครฟรี", emphasis: "primary" },
    ]);
    expect(publicHeaderActions("member")).toEqual([
      { href: "/app", label: "ไปพื้นที่สมาชิก", emphasis: "primary" },
    ]);
    expect(publicFreeAccountAction("guest")).toEqual({
      href: "/login?mode=signup&next=%2Fapp",
      label: "สมัครสมาชิกฟรี",
    });
    expect(publicFreeAccountAction("member")).toEqual({ href: "/app", label: "ไปพื้นที่สมาชิก" });
  });

  it("uses the authenticated getUser result for the initial state", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    harness.userRequest.resolve({ data: { user: MEMBER_USER }, error: null });
    await harness.userRequest.promise;

    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith("member"));
  });

  it("falls back to the guest state when the authoritative user check fails", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    harness.userRequest.resolve({ data: { user: null }, error: new AuthSessionMissingError() });
    await harness.userRequest.promise;

    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledOnce();
      expect(apply).toHaveBeenCalledWith("guest");
    });
  });

  it("falls back to guest when the authoritative user request rejects", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    harness.userRequest.reject(new Error("network unavailable"));
    await expect(harness.userRequest.promise).rejects.toThrow("network unavailable");
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith("guest"));
  });

  it("bounds a stalled authoritative user check so the CTAs do not remain skeletons", async () => {
    vi.useFakeTimers();
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith("guest");
  });

  it("returns a signed-out member to guest actions without reloading", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    harness.userRequest.resolve({ data: { user: MEMBER_USER }, error: null });
    await harness.userRequest.promise;
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith("member"));
    harness.emit("SIGNED_OUT", null);

    expect(apply).toHaveBeenNthCalledWith(1, "member");
    expect(apply).toHaveBeenNthCalledWith(2, "guest");
  });

  it("lets a newer auth event win over a stale initial response", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    observePublicAuthState(harness.auth, apply);

    harness.emit("SIGNED_IN", MEMBER_USER);
    harness.userRequest.resolve({ data: { user: null }, error: new AuthSessionMissingError() });
    await harness.userRequest.promise;

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("member");
  });

  it("unsubscribes and ignores late work after unmount", async () => {
    const harness = authHarness();
    const apply = vi.fn();
    const cleanup = observePublicAuthState(harness.auth, apply);

    cleanup();
    harness.userRequest.resolve({ data: { user: MEMBER_USER }, error: null });
    await harness.userRequest.promise;

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });
});
