import type { ResendParams } from "@supabase/supabase-js";
import { safeAuthNext } from "@/lib/authReturnPath";

export const SIGNUP_CONFIRMATION_COOLDOWN_SECONDS = 60;

export const SIGNUP_PENDING_MESSAGE =
  "รับคำขอสมัครแล้ว หากอีเมลนี้ใช้สมัครได้ ระบบจะส่งลิงก์ยืนยัน กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const SIGNUP_CONFIRMATION_LINK_UNAVAILABLE_MESSAGE =
  "ระบบยังเตรียมลิงก์ยืนยันไม่สำเร็จ กรุณาลองใหม่ภายหลังหรือติดต่อทีมงาน";
export const RESEND_CONFIRMATION_SUCCESS_MESSAGE =
  "หากอีเมลนี้มีบัญชีที่รอยืนยัน ระบบจะส่งอีเมลยืนยันอีกครั้ง กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const RESEND_CONFIRMATION_UNAVAILABLE_MESSAGE =
  "ยังส่งอีเมลยืนยันไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลังหรือติดต่อทีมงาน";
export const PASSWORD_RESET_REQUEST_MESSAGE =
  "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม";
export const AUTH_RATE_LIMIT_MESSAGE =
  "มีการส่งคำขอถี่เกินไป กรุณารอครบเวลาแล้วลองใหม่";

const GENERIC_AUTH_MESSAGES = {
  signup: SIGNUP_PENDING_MESSAGE,
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
  return operation !== "signup" && isAuthRateLimitError(error)
    ? AUTH_RATE_LIMIT_MESSAGE
    : GENERIC_AUTH_MESSAGES[operation];
}

const DEFINITIVE_PRE_ACCOUNT_SIGNUP_MESSAGES = {
  weak_password: "รหัสผ่านยังไม่ผ่านเงื่อนไขความปลอดภัย กรุณาใช้รหัสผ่านที่ยาวและคาดเดายากขึ้น",
  email_address_invalid: "รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจอีเมลแล้วลองใหม่",
  validation_failed: "ข้อมูลสมัครยังไม่ถูกต้อง กรุณาตรวจข้อมูลที่กรอกแล้วลองใหม่",
  captcha_failed: "การยืนยันความปลอดภัยไม่สำเร็จ กรุณาลองใหม่",
  signup_disabled: "ระบบปิดรับสมัครบัญชีใหม่ชั่วคราว กรุณาติดต่อทีมงาน",
  email_provider_disabled: "ระบบสมัครด้วยอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อทีมงาน",
} as const;

type DefinitivePreAccountSignupCode = keyof typeof DEFINITIVE_PRE_ACCOUNT_SIGNUP_MESSAGES;

export type SignupFailureTransition = {
  kind: "correctable" | "recovery";
  message: string;
  mode: "signup" | "signin";
  clearPasswords: boolean;
  openConfirmationHelp: boolean;
  presentation: "notice" | "error";
  resendCooldownSeconds: number;
};

function definitivePreAccountSignupMessage(error: unknown): string | null {
  const { code } = authErrorShape(error);
  if (
    typeof code !== "string"
    || !Object.prototype.hasOwnProperty.call(DEFINITIVE_PRE_ACCOUNT_SIGNUP_MESSAGES, code)
  ) return null;
  return DEFINITIVE_PRE_ACCOUNT_SIGNUP_MESSAGES[code as DefinitivePreAccountSignupCode];
}

/**
 * Maps only stable, definitive pre-account codes to corrective form errors.
 * Every unknown/account/delivery/network outcome uses the same recovery state
 * and resend guard. Keeping this policy outside the component makes the state
 * transition and privacy behaviour testable without contacting Auth.
 */
export function signupFailureTransition(error: unknown): SignupFailureTransition {
  const correctiveMessage = definitivePreAccountSignupMessage(error);
  if (correctiveMessage) {
    return {
      kind: "correctable",
      message: correctiveMessage,
      mode: "signup",
      clearPasswords: false,
      openConfirmationHelp: false,
      presentation: "error",
      resendCooldownSeconds: 0,
    };
  }

  return {
    kind: "recovery",
    message: SIGNUP_PENDING_MESSAGE,
    mode: "signin",
    clearPasswords: true,
    openConfirmationHelp: true,
    presentation: "notice",
    // A provider failure can be returned after Auth has already created an
    // unconfirmed account or attempted delivery. Guard every indeterminate
    // outcome, including explicit 429s, so the recovery CTA cannot immediately
    // generate a second message or turn provider state into a visible oracle.
    resendCooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
  };
}

export function canResendSignupConfirmation(cooldownSeconds: number, resending: boolean): boolean {
  return cooldownSeconds <= 0 && !resending;
}

export interface SignupConfirmationResendState {
  readonly cooldownSeconds: number;
  readonly resending: boolean;
}

export const INITIAL_SIGNUP_CONFIRMATION_RESEND_STATE: SignupConfirmationResendState = {
  cooldownSeconds: 0,
  resending: false,
};

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

export type SignupConfirmationResendAttemptResult =
  | ResendSignupConfirmationResult
  | { outcome: "blocked" };

export type SignupConfirmationFeedback = {
  presentation: "notice" | "error";
  message: string;
};

/**
 * Keeps throttling and accepted provider outcomes visually identical. Invalid
 * local input/configuration is safe to correct because no provider request was
 * made and it cannot reveal whether an account exists.
 */
export function signupConfirmationFeedback(
  result: ResendSignupConfirmationResult,
): SignupConfirmationFeedback {
  return result.outcome === "invalid"
    ? { presentation: "error", message: RESEND_CONFIRMATION_UNAVAILABLE_MESSAGE }
    : { presentation: "notice", message: RESEND_CONFIRMATION_SUCCESS_MESSAGE };
}

export interface SignupConfirmationResendController {
  getState(): SignupConfirmationResendState;
  applySignupFailure(error: unknown): SignupFailureTransition;
  startCooldown(seconds?: number): void;
  elapseSecond(): void;
  requestResend(
    resend: () => Promise<ResendSignupConfirmationResult>,
  ): Promise<SignupConfirmationResendAttemptResult>;
}

/**
 * Owns the resend gate synchronously so a disabled-looking CTA cannot issue a
 * provider request through a stale render or a fast double click. React only
 * mirrors the emitted state for presentation; this controller remains the
 * authority for whether the effect is allowed to run.
 */
export function createSignupConfirmationResendController(
  onStateChange: (state: SignupConfirmationResendState) => void = () => undefined,
): SignupConfirmationResendController {
  let state = INITIAL_SIGNUP_CONFIRMATION_RESEND_STATE;

  const updateState = (nextState: SignupConfirmationResendState) => {
    if (
      nextState.cooldownSeconds === state.cooldownSeconds
      && nextState.resending === state.resending
    ) return;

    state = nextState;
    onStateChange(state);
  };

  const startCooldown = (seconds = SIGNUP_CONFIRMATION_COOLDOWN_SECONDS) => {
    const cooldownSeconds = Math.max(0, Math.ceil(seconds));
    updateState({
      ...state,
      cooldownSeconds: Math.max(state.cooldownSeconds, cooldownSeconds),
    });
  };

  return {
    getState: () => state,
    applySignupFailure: (error) => {
      const transition = signupFailureTransition(error);
      if (transition.resendCooldownSeconds > 0) {
        startCooldown(transition.resendCooldownSeconds);
      }
      return transition;
    },
    startCooldown,
    elapseSecond: () => {
      if (state.cooldownSeconds <= 0) return;
      updateState({
        ...state,
        cooldownSeconds: Math.max(0, state.cooldownSeconds - 1),
      });
    },
    requestResend: async (resend) => {
      if (!canResendSignupConfirmation(state.cooldownSeconds, state.resending)) {
        return { outcome: "blocked" };
      }

      updateState({
        cooldownSeconds: SIGNUP_CONFIRMATION_COOLDOWN_SECONDS,
        resending: true,
      });
      try {
        return await resend();
      } finally {
        updateState({ ...state, resending: false });
      }
    },
  };
}

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
    // The distinct rate-limited outcome lets the controller retain its local
    // guard, but the UI deliberately presents it as the same accepted resend
    // state. This prevents discovery through provider outcome differences.
    return error && isAuthRateLimitError(error)
      ? { outcome: "rate-limited" }
      : { outcome: "accepted" };
  } catch {
    return { outcome: "accepted" };
  }
}
