import type { ResendParams } from "@supabase/supabase-js";
import { safeAuthNext } from "@/lib/authReturnPath";

export const SIGNUP_CONFIRMATION_COOLDOWN_SECONDS = 60;

export const SIGNUP_PENDING_MESSAGE =
  "รับคำขอสมัครแล้ว หากอีเมลนี้ใช้สมัครได้ ระบบจะส่งลิงก์ยืนยัน กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const RESEND_CONFIRMATION_SUCCESS_MESSAGE =
  "หากอีเมลนี้มีบัญชีที่รอยืนยัน ระบบจะส่งอีเมลยืนยันอีกครั้ง กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const PASSWORD_RESET_REQUEST_MESSAGE =
  "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const AUTH_RATE_LIMIT_MESSAGE =
  "มีการส่งคำขอถี่เกินไป กรุณารอครบเวลาแล้วลองใหม่";

const GENERIC_AUTH_MESSAGES = {
  signup:
    "สมัครสมาชิกไม่สำเร็จในขณะนี้ หากเคยสมัครแล้วแต่ยังไม่ได้ยืนยัน ให้ลองส่งอีเมลยืนยันอีกครั้ง",
  signin: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่ได้ยืนยันอีเมล",
  resend: RESEND_CONFIRMATION_SUCCESS_MESSAGE,
  passwordReset: PASSWORD_RESET_REQUEST_MESSAGE,
} as const;

export type AuthUiOperation = keyof typeof GENERIC_AUTH_MESSAGES;

type AuthErrorShape = {
  code?: unknown;
  status?: unknown;
};

function authErrorShape(error: unknown): AuthErrorShape {
  return typeof error === "object" && error !== null ? error : {};
}

export function isAuthRateLimitError(error: unknown): boolean {
  const { code, status } = authErrorShape(error);
  return status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}

export function thaiAuthErrorMessage(operation: AuthUiOperation, error: unknown): string {
  return isAuthRateLimitError(error) ? AUTH_RATE_LIMIT_MESSAGE : GENERIC_AUTH_MESSAGES[operation];
}

export function isPlausibleEmail(rawEmail: string): boolean {
  const email = rawEmail.trim();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Builds the one callback URL permitted by the signup flow. The caller must
 * pass `window.location.origin`; paths, credentials and non-HTTP origins are
 * rejected, while the eventual app destination is reduced to the internal
 * allowlist in `safeAuthNext`.
 */
export function buildSignupConfirmationRedirect(origin: string, rawNext: string | null | undefined): string | null {
  try {
    const parsedOrigin = new URL(origin);
    if (
      !["http:", "https:"].includes(parsedOrigin.protocol)
      || parsedOrigin.username
      || parsedOrigin.password
      || parsedOrigin.pathname !== "/"
      || parsedOrigin.search
      || parsedOrigin.hash
    ) {
      return null;
    }

    const callback = new URL("/auth/callback", parsedOrigin.origin);
    callback.searchParams.set("next", safeAuthNext(rawNext));
    return callback.toString();
  } catch {
    return null;
  }
}

type SignupResendParams = Extract<ResendParams, { email: string }>;
type SignupResend = (credentials: SignupResendParams) => PromiseLike<{ error: unknown }>;

export type ResendSignupConfirmationResult =
  | { outcome: "accepted" }
  | { outcome: "rate-limited" }
  | { outcome: "invalid" };

/**
 * Small injectable boundary around Supabase Auth. Tests pass a mock function,
 * so the unit suite never sends an email or contacts a live project.
 */
export async function resendSignupConfirmation(
  resend: SignupResend,
  email: string,
  origin: string,
  rawNext: string | null | undefined,
): Promise<ResendSignupConfirmationResult> {
  const emailRedirectTo = buildSignupConfirmationRedirect(origin, rawNext);
  if (!emailRedirectTo || !isPlausibleEmail(email)) return { outcome: "invalid" };

  try {
    const { error } = await resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo },
    });
    // Except for an explicit rate limit, provider outcomes intentionally
    // collapse to the same user-visible accepted state. This prevents account
    // discovery through differences between an existing, missing, confirmed,
    // or partially-created account.
    return error && isAuthRateLimitError(error)
      ? { outcome: "rate-limited" }
      : { outcome: "accepted" };
  } catch {
    return { outcome: "accepted" };
  }
}
