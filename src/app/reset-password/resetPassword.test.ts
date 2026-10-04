import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  RECOVERY_LINK_ERROR_MESSAGE,
  RECOVERY_PASSWORD_ERROR_MESSAGE,
  updateRecoveryPassword,
  verifyRecoveryCredential,
} from "./recovery";

const providerDetail = "SMTP rejected secret-user@example.com with private token";

describe("password recovery link verification", () => {
  it("verifies a recovery token before reading the authenticated user", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const exchangeCodeForSession = vi.fn();
    const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));

    await expect(verifyRecoveryCredential(
      { verifyOtp, exchangeCodeForSession, getUser },
      "TOKEN",
      null,
    )).resolves.toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "TOKEN", type: "recovery" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("exchanges a PKCE code before reading the authenticated user", async () => {
    const verifyOtp = vi.fn();
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));

    await expect(verifyRecoveryCredential(
      { verifyOtp, exchangeCodeForSession, getUser },
      null,
      "CODE",
    )).resolves.toEqual({ ok: true });
    expect(exchangeCodeForSession).toHaveBeenCalledWith("CODE");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("collapses returned provider errors to fixed Thai copy", async () => {
    const getUser = vi.fn();
    const result = await verifyRecoveryCredential({
      verifyOtp: vi.fn(async () => ({ error: { message: providerDetail } })),
      exchangeCodeForSession: vi.fn(),
      getUser,
    }, "TOKEN", null);

    expect(result).toEqual({ ok: false, message: RECOVERY_LINK_ERROR_MESSAGE });
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain("secret-user@example.com");
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["verifyOtp", "TOKEN", null],
    ["exchangeCodeForSession", null, "CODE"],
    ["getUser", "TOKEN", null],
  ] as const)("handles a rejected %s promise and exits verification", async (rejectedMethod, tokenHash, code) => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    const rejection = vi.fn(async () => { throw new Error(providerDetail); });
    const auth = {
      verifyOtp: rejectedMethod === "verifyOtp" ? rejection : verifyOtp,
      exchangeCodeForSession: rejectedMethod === "exchangeCodeForSession" ? rejection : exchangeCodeForSession,
      getUser: rejectedMethod === "getUser" ? rejection : getUser,
    };

    const result = await verifyRecoveryCredential(auth, tokenHash, code);
    expect(result).toEqual({ ok: false, message: RECOVERY_LINK_ERROR_MESSAGE });
    expect(JSON.stringify(result)).not.toContain(providerDetail);
  });

  it("fails safely when getUser returns no authenticated user", async () => {
    const result = await verifyRecoveryCredential({
      verifyOtp: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(async () => ({ data: { user: null }, error: { message: providerDetail } })),
    }, "TOKEN", null);

    expect(result).toEqual({ ok: false, message: RECOVERY_LINK_ERROR_MESSAGE });
  });

  it("fails safely when the provider returns a malformed verification response", async () => {
    const getUser = vi.fn();
    const result = await verifyRecoveryCredential({
      verifyOtp: vi.fn(async () => undefined),
      exchangeCodeForSession: vi.fn(),
      getUser,
    }, "TOKEN", null);

    expect(result).toEqual({ ok: false, message: RECOVERY_LINK_ERROR_MESSAGE });
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("password recovery update", () => {
  it("never reflects a returned provider error and always resets loading", async () => {
    const loading: boolean[] = [];
    const result = await updateRecoveryPassword({
      updateUser: vi.fn(async () => ({ error: { message: providerDetail } })),
    }, "new-password", (value) => loading.push(value));

    expect(result).toEqual({
      ok: false,
      clearPasswords: true,
      message: RECOVERY_PASSWORD_ERROR_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain("secret-user@example.com");
    expect(loading).toEqual([true, false]);
  });

  it("handles a rejected updateUser promise, clears secrets, and resets loading", async () => {
    const loading: boolean[] = [];
    const result = await updateRecoveryPassword({
      updateUser: vi.fn(async () => { throw new Error(providerDetail); }),
    }, "new-password", (value) => loading.push(value));

    expect(result).toEqual({
      ok: false,
      clearPasswords: true,
      message: RECOVERY_PASSWORD_ERROR_MESSAGE,
    });
    expect(loading).toEqual([true, false]);
  });

  it("resets loading and clears the password after a successful update", async () => {
    const loading: boolean[] = [];
    const updateUser = vi.fn(async () => ({ error: null }));
    await expect(updateRecoveryPassword(
      { updateUser },
      "new-password",
      (value) => loading.push(value),
    )).resolves.toEqual({ ok: true, clearPasswords: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(loading).toEqual([true, false]);
  });

  it("keeps the page wired to generic copy and clears both password fields", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("setError(updateError.message)");
    expect(source).toContain('setPassword("")');
    expect(source).toContain('setConfirmPassword("")');
  });
});
