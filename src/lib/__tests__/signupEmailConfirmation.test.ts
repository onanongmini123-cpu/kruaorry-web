import { describe, expect, it, vi } from "vitest";
import {
  AUTH_RATE_LIMIT_MESSAGE,
  buildSignupConfirmationRedirect,
  createSignupConfirmationResendController,
  isAuthRateLimitError,
  isPlausibleEmail,
  resendSignupConfirmation,
  SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
  signupFailureRecovery,
  thaiAuthErrorMessage,
} from "../signupEmailConfirmation";

describe("signup email confirmation", () => {
  it("builds a same-origin callback and reduces an external destination to /app", () => {
    expect(buildSignupConfirmationRedirect("https://kruaorry-web.vercel.app", "/app?view=library"))
      .toBe("https://kruaorry-web.vercel.app/auth/callback?next=%2Fapp%3Fview%3Dlibrary");
    expect(buildSignupConfirmationRedirect("https://kruaorry-web.vercel.app", "https://evil.example/steal"))
      .toBe("https://kruaorry-web.vercel.app/auth/callback?next=%2Fapp");
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?next=https://evil.example",
    "not an origin",
  ])("rejects a non-origin callback base: %s", (origin) => {
    expect(buildSignupConfirmationRedirect(origin, "/app")).toBeNull();
  });

  it("uses safe generic Thai errors without reflecting provider details", () => {
    const providerSecret = "SMTP credential rejected for secret-user@example.com";
    for (const operation of ["signup", "signin", "resend", "passwordReset"] as const) {
      const message = thaiAuthErrorMessage(operation, { message: providerSecret, code: "unexpected_failure" });
      expect(message).not.toContain(providerSecret);
      expect(message).not.toContain("secret-user@example.com");
    }
  });

  it("recognizes rate-limit codes without matching English messages", () => {
    expect(isAuthRateLimitError({ code: "over_email_send_rate_limit" })).toBe(true);
    expect(isAuthRateLimitError({ code: "over_request_rate_limit" })).toBe(true);
    expect(isAuthRateLimitError({ status: 429 })).toBe(true);
    expect(thaiAuthErrorMessage("resend", { status: 429, message: "provider secret" }))
      .toBe(AUTH_RATE_LIMIT_MESSAGE);
  });

  it("validates the email locally before any resend call", async () => {
    const resend = vi.fn();
    expect(isPlausibleEmail(" teacher@example.com ")).toBe(true);
    expect(isPlausibleEmail("not-an-email")).toBe(false);

    await expect(resendSignupConfirmation(
      resend,
      "not-an-email",
      "https://kruaorry-web.vercel.app",
      "/app",
    )).resolves.toEqual({ outcome: "invalid" });
    expect(resend).not.toHaveBeenCalled();
  });

  it("calls only the mocked Supabase resend boundary with the safe callback", async () => {
    const resend = vi.fn(async () => ({ error: null }));
    await expect(resendSignupConfirmation(
      resend,
      " teacher@example.com ",
      "https://kruaorry-web.vercel.app",
      "/app?view=favorites",
    )).resolves.toEqual({ outcome: "accepted" });

    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "teacher@example.com",
      options: {
        emailRedirectTo: "https://kruaorry-web.vercel.app/auth/callback?next=%2Fapp%3Fview%3Dfavorites",
      },
    });
  });

  it("exposes only rate limiting and collapses other provider outcomes", async () => {
    const rateLimited = vi.fn(async () => ({
      error: { code: "over_email_send_rate_limit", message: "sensitive provider detail" },
    }));
    await expect(resendSignupConfirmation(
      rateLimited,
      "teacher@example.com",
      "https://kruaorry-web.vercel.app",
      "/app",
    )).resolves.toEqual({ outcome: "rate-limited" });

    const rejectedByProvider = vi.fn(async () => ({
      error: { code: "unexpected_failure", message: "sensitive provider detail" },
    }));
    await expect(resendSignupConfirmation(
      rejectedByProvider,
      "teacher@example.com",
      "https://kruaorry-web.vercel.app",
      "/app",
    )).resolves.toEqual({ outcome: "accepted" });

    const rejected = vi.fn(async () => {
      throw new Error("network secret");
    });
    await expect(resendSignupConfirmation(
      rejected,
      "teacher@example.com",
      "https://kruaorry-web.vercel.app",
      "/app",
    )).resolves.toEqual({ outcome: "accepted" });
  });

  it("blocks provider calls for all 60 cooldown seconds, then allows exactly one resend", async () => {
    const providerDetail = "SMTP rejected secret-user@example.com with private token";
    const resend = vi.fn(async () => ({ outcome: "accepted" } as const));
    const controller = createSignupConfirmationResendController();
    const recovery = controller.applySignupFailure({
      code: "over_email_send_rate_limit",
      message: providerDetail,
    });

    expect(recovery).toEqual({
      message: AUTH_RATE_LIMIT_MESSAGE,
      openConfirmationHelp: true,
      resendCooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
    });
    expect(recovery.message).not.toContain(providerDetail);
    expect(recovery.message).not.toContain("secret-user@example.com");

    for (let elapsedSeconds = 0; elapsedSeconds < SIGNUP_CONFIRMATION_COOLDOWN_SECONDS; elapsedSeconds += 1) {
      expect(controller.getState().cooldownSeconds)
        .toBe(SIGNUP_CONFIRMATION_COOLDOWN_SECONDS - elapsedSeconds);
      await expect(controller.requestResend(resend)).resolves.toEqual({ outcome: "blocked" });
      controller.elapseSecond();
    }

    expect(controller.getState()).toEqual({ cooldownSeconds: 0, resending: false });
    expect(resend).not.toHaveBeenCalled();

    await expect(controller.requestResend(resend)).resolves.toEqual({ outcome: "accepted" });
    expect(resend).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      cooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
      resending: false,
    });

    await expect(controller.requestResend(resend)).resolves.toEqual({ outcome: "blocked" });
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("keeps non-rate-limited signup failures on the same privacy-safe recovery surface", () => {
    const recovery = signupFailureRecovery({
      code: "user_already_exists",
      message: "secret-user@example.com already exists",
    });

    expect(recovery.openConfirmationHelp).toBe(true);
    expect(recovery.resendCooldownSeconds).toBe(0);
    expect(recovery.message).not.toContain("secret-user@example.com");
  });
});
