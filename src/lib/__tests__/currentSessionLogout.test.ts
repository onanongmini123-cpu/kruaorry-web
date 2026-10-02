import { describe, expect, it, vi } from "vitest";
import { CURRENT_SESSION_LOGOUT_ERROR, signOutCurrentSession } from "../currentSessionLogout";

describe("current-session logout", () => {
  it("clears only the current browser session", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const getSession = vi.fn();

    await expect(signOutCurrentSession({ signOut, getSession })).resolves.toBeNull();
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("continues to login when Supabase reports an error after clearing the local session", async () => {
    const signOut = vi.fn(async () => ({ error: new Error("sensitive upstream detail") }));
    const getSession = vi.fn(async () => ({ data: { session: null } }));

    await expect(signOutCurrentSession({ signOut, getSession })).resolves.toBeNull();
  });

  it("returns a safe Thai error when a local session remains after logout fails", async () => {
    const signOut = vi.fn(async () => ({ error: new Error("sensitive upstream detail") }));
    const getSession = vi.fn(async () => ({ data: { session: { access_token: "local-only" } } }));

    await expect(signOutCurrentSession({ signOut, getSession })).resolves.toBe(CURRENT_SESSION_LOGOUT_ERROR);
  });

  it("checks local state when logout throws", async () => {
    const signOut = vi.fn(async () => {
      throw new Error("network detail");
    });
    const getSession = vi.fn(async () => ({ data: { session: null } }));

    await expect(signOutCurrentSession({ signOut, getSession })).resolves.toBeNull();
  });

  it("fails closed when local session verification also fails", async () => {
    const signOut = vi.fn(async () => ({ error: new Error("remote detail") }));
    const getSession = vi.fn(async () => {
      throw new Error("storage detail");
    });

    await expect(signOutCurrentSession({ signOut, getSession })).resolves.toBe(CURRENT_SESSION_LOGOUT_ERROR);
  });
});
