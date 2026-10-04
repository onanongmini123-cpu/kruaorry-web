import { describe, expect, it, vi } from "vitest";
import {
  AUTH_RATE_LIMIT_MESSAGE,
  buildSignupConfirmationRedirect,
  createSignupConfirmationResendController,
  isAuthRateLimitError,
  isPlausibleEmail,
  resendSignupConfirmation,
  SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE,
  SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
  SIGNUP_PENDING_MESSAGE,
  signupConfirmationFeedback,
  signupFailureTransition,
  thaiAuthErrorMessage,
} from "../signupEmailConfirmation";

describe("signup email confirmation", () => {
  it("builds the one same-origin callback whose destination is /app", () => {
    expect(buildSignupConfirmationRedirect("https://kruaorry-web.vercel.app"))
      .toBe("https://kruaorry-web.vercel.app/auth/callback?next=%2Fapp");
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?next=https://evil.example",
    "not an origin",
  ])("rejects a non-origin callback base: %s", (origin) => {
    expect(buildSignupConfirmationRedirect(origin)).toBeNull();
    expect(SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE).toMatch(/[\u0E00-\u0E7F]/);
    expect(SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE).not.toMatch(/SMTP|Resend|Supabase|error/i);
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
    expect(thaiAuthErrorMessage("signup", { status: 429, message: "provider secret" }))
      .toBe(SIGNUP_PENDING_MESSAGE);
  });

  it("validates the email locally before any resend call", async () => {
    const resend = vi.fn();
    expect(isPlausibleEmail(" teacher@example.com ")).toBe(true);
    expect(isPlausibleEmail("not-an-email")).toBe(false);

    await expect(resendSignupConfirmation(
      resend,
      "not-an-email",
      "https://kruaorry-web.vercel.app",
    )).resolves.toEqual({ outcome: "invalid" });
    expect(resend).not.toHaveBeenCalled();
  });

  it("calls only the mocked Supabase resend boundary with the safe callback", async () => {
    const resend = vi.fn(async () => ({ error: null }));
    await expect(resendSignupConfirmation(
      resend,
      " teacher@example.com ",
      "https://kruaorry-web.vercel.app",
    )).resolves.toEqual({ outcome: "accepted" });

    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "teacher@example.com",
      options: {
        emailRedirectTo: "https://kruaorry-web.vercel.app/auth/callback?next=%2Fapp",
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
    )).resolves.toEqual({ outcome: "rate-limited" });

    const rejectedByProvider = vi.fn(async () => ({
      error: { code: "unexpected_failure", message: "sensitive provider detail" },
    }));
    await expect(resendSignupConfirmation(
      rejectedByProvider,
      "teacher@example.com",
      "https://kruaorry-web.vercel.app",
    )).resolves.toEqual({ outcome: "accepted" });

    const rejected = vi.fn(async () => {
      throw new Error("network secret");
    });
    await expect(resendSignupConfirmation(
      rejected,
      "teacher@example.com",
      "https://kruaorry-web.vercel.app",
    )).resolves.toEqual({ outcome: "accepted" });
  });

  it("renders rate-limited resend exactly like an accepted resend", () => {
    expect(signupConfirmationFeedback({ outcome: "rate-limited" }))
      .toEqual(signupConfirmationFeedback({ outcome: "accepted" }));
    expect(signupConfirmationFeedback({ outcome: "accepted" })).toEqual({
      presentation: "notice",
      message: expect.stringContaining("หากอีเมลนี้มีบัญชีที่รอยืนยัน"),
    });
    expect(signupConfirmationFeedback({ outcome: "invalid" })).toEqual({
      presentation: "error",
      message: expect.not.stringContaining("SMTP"),
    });
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
      kind: "recovery",
      message: SIGNUP_PENDING_MESSAGE,
      mode: "signin",
      clearPasswords: true,
      openConfirmationHelp: true,
      presentation: "notice",
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

  it("collapses account, SMTP, and network failures to the same privacy-safe recovery", () => {
    const sensitiveFailures = [
      {
        code: "user_already_exists",
        message: "secret-user@example.com already exists",
      },
      {
        code: "unexpected_failure",
        status: 500,
        message: "Error sending confirmation email through smtp.resend.com",
      },
      new Error("network failed after secret-user@example.com was created"),
      { code: "over_email_send_rate_limit", status: 429, message: "provider throttled" },
      null,
    ];

    const recoveries = sensitiveFailures.map(signupFailureTransition);
    expect(new Set(recoveries.map((recovery) => JSON.stringify(recovery))).size).toBe(1);
    expect(recoveries[0]).toEqual({
      kind: "recovery",
      message: SIGNUP_PENDING_MESSAGE,
      mode: "signin",
      clearPasswords: true,
      openConfirmationHelp: true,
      presentation: "notice",
      resendCooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
    });
    for (const recovery of recoveries) {
      expect(recovery.message).not.toContain("secret-user@example.com");
      expect(recovery.message).not.toContain("SMTP");
      expect(recovery.message).not.toContain("Resend");
      expect(recovery.message).not.toContain("Error sending confirmation email");
    }
  });

  it.each([
    "weak_password",
    "email_address_invalid",
    "validation_failed",
    "captcha_failed",
    "signup_disabled",
    "email_provider_disabled",
  ])("keeps definitive pre-account error %s on signup with safe corrective copy", (code) => {
    const providerDetail = "secret-user@example.com provider detail";
    const controller = createSignupConfirmationResendController();
    const transition = controller.applySignupFailure({ code, message: providerDetail });

    expect(transition.kind).toBe("correctable");
    expect(transition.mode).toBe("signup");
    expect(transition.clearPasswords).toBe(false);
    expect(transition.openConfirmationHelp).toBe(false);
    expect(transition.presentation).toBe("error");
    expect(transition.resendCooldownSeconds).toBe(0);
    expect(transition.message).not.toContain(providerDetail);
    expect(transition.message).not.toContain("secret-user@example.com");
    expect(controller.getState()).toEqual({ cooldownSeconds: 0, resending: false });
  });

  it("immediately guards resend after an indeterminate mail-delivery failure", async () => {
    const resend = vi.fn(async () => ({ outcome: "accepted" } as const));
    const controller = createSignupConfirmationResendController();

    const recovery = controller.applySignupFailure({
      code: "unexpected_failure",
      status: 500,
      message: "Error sending confirmation email",
    });

    expect(recovery.presentation).toBe("notice");
    expect(recovery.mode).toBe("signin");
    expect(recovery.clearPasswords).toBe(true);
    expect(controller.getState()).toEqual({
      cooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
      resending: false,
    });
    await expect(controller.requestResend(resend)).resolves.toEqual({ outcome: "blocked" });
    expect(resend).not.toHaveBeenCalled();
  });
});
