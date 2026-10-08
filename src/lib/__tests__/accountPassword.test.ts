import { describe, expect, it, vi } from "vitest";
import {
  changeMemberPassword,
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  PASSWORD_REUSE_MESSAGE,
  passwordEmailForUser,
} from "../accountPassword";
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE } from "../passwordPolicy";
import { SIGNUP_PASSWORD_MISMATCH_MESSAGE } from "../signupConfirmation";

function createAuth() {
  return {
    signInWithPassword: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    updateUser: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    signOut: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
  };
}

const validInput = {
  currentPassword: "old-password",
  newPassword: "new-password",
  confirmPassword: "new-password",
};

describe("member password change", () => {
  it("shows a friendly Thai error when the current password is wrong", async () => {
    const auth = createAuth();
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });

    const result = await changeMemberPassword(auth, "member@example.com", validInput);

    expect(result).toEqual({ ok: false, message: CURRENT_PASSWORD_INCORRECT_MESSAGE });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than the shared minimum before calling Auth", async () => {
    const auth = createAuth();
    const shortPassword = "x".repeat(PASSWORD_MIN_LENGTH - 1);

    const result = await changeMemberPassword(auth, "member@example.com", {
      ...validInput,
      newPassword: shortPassword,
      confirmPassword: shortPassword,
    });

    expect(result).toEqual({ ok: false, message: PASSWORD_MIN_LENGTH_MESSAGE });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation before calling Auth", async () => {
    const auth = createAuth();

    const result = await changeMemberPassword(auth, "member@example.com", {
      ...validInput,
      confirmPassword: "different-password",
    });

    expect(result).toEqual({ ok: false, message: SIGNUP_PASSWORD_MISMATCH_MESSAGE });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects reuse of the current password before calling Auth", async () => {
    const auth = createAuth();

    const result = await changeMemberPassword(auth, "member@example.com", {
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    });

    expect(result).toEqual({ ok: false, message: PASSWORD_REUSE_MESSAGE });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("verifies, updates, and signs out other devices while keeping this session", async () => {
    const auth = createAuth();

    const result = await changeMemberPassword(auth, "member@example.com", validInput);

    expect(result).toEqual({ ok: true, warning: null });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "member@example.com",
      password: validInput.currentPassword,
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: validInput.newPassword });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("hides password controls for users without an email password identity", () => {
    expect(passwordEmailForUser({
      email: "oauth@example.com",
      identities: [{ provider: "google" }],
      app_metadata: { provider: "google", providers: ["google"] },
    })).toBeNull();

    expect(passwordEmailForUser({
      email: "member@example.com",
      identities: [{ provider: "email" }],
      app_metadata: { provider: "email", providers: ["email"] },
    })).toBe("member@example.com");
  });
});
