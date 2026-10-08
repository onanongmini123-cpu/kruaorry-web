import { validateNewPasswordLength } from "@/lib/passwordPolicy";
import { validateSignupPasswordConfirmation } from "@/lib/signupConfirmation";
import { friendlyErrorMessage } from "@/lib/userMessages";

export const CURRENT_PASSWORD_REQUIRED_MESSAGE = "กรอกรหัสผ่านปัจจุบัน";
export const CURRENT_PASSWORD_INCORRECT_MESSAGE = "รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาลองอีกครั้ง";
export const PASSWORD_REUSE_MESSAGE = "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน";
export const PASSWORD_CHANGE_FAILED_MESSAGE = "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง";
export const OTHER_SESSIONS_SIGN_OUT_FAILED_MESSAGE = "ออกจากระบบอุปกรณ์อื่นไม่สำเร็จ กรุณาลองใหม่ภายหลัง";

type PasswordIdentityUser = {
  email?: string | null;
  identities?: ReadonlyArray<{ provider?: string | null }> | null;
  app_metadata?: {
    provider?: unknown;
    providers?: unknown;
  } | null;
};

type PasswordAuthBoundary = {
  signInWithPassword: (credentials: { email: string; password: string }) => PromiseLike<{ error?: unknown } | null | undefined>;
  updateUser: (attributes: { password: string }) => PromiseLike<{ error?: unknown } | null | undefined>;
  signOut: (options: { scope: "others" }) => PromiseLike<{ error?: unknown } | null | undefined>;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type PasswordChangeResult =
  | { ok: false; message: string }
  | { ok: true; warning: string | null };

/**
 * The browser user object never exposes password hashes. In this product the
 * email identity is created by the email + password flow, while OAuth-only
 * identities must not see password controls. app_metadata is a compatibility
 * fallback for older Auth responses that omit `identities`.
 */
export function passwordEmailForUser(user: PasswordIdentityUser | null | undefined): string | null {
  const email = user?.email?.trim();
  if (!email) return null;

  const identityProviders = user?.identities?.map((identity) => identity.provider) ?? [];
  const metadataProviders = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string")
    : [];
  const primaryProvider = typeof user?.app_metadata?.provider === "string"
    ? user.app_metadata.provider
    : null;

  return identityProviders.includes("email")
    || metadataProviders.includes("email")
    || primaryProvider === "email"
    ? email
    : null;
}

export function validatePasswordChange(input: PasswordChangeInput): string | null {
  if (!input.currentPassword) return CURRENT_PASSWORD_REQUIRED_MESSAGE;

  const lengthError = validateNewPasswordLength(input.newPassword);
  if (lengthError) return lengthError;

  const confirmationError = validateSignupPasswordConfirmation(input.newPassword, input.confirmPassword);
  if (confirmationError) return confirmationError;

  return input.newPassword === input.currentPassword ? PASSWORD_REUSE_MESSAGE : null;
}

export async function changeMemberPassword(
  auth: PasswordAuthBoundary,
  email: string,
  input: PasswordChangeInput,
): Promise<PasswordChangeResult> {
  const validationError = validatePasswordChange(input);
  if (validationError) return { ok: false, message: validationError };

  try {
    const verification = await auth.signInWithPassword({
      email,
      password: input.currentPassword,
    });
    if (!verification || verification.error) {
      return {
        ok: false,
        message: friendlyErrorMessage(verification?.error, CURRENT_PASSWORD_INCORRECT_MESSAGE),
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: friendlyErrorMessage(error, CURRENT_PASSWORD_INCORRECT_MESSAGE),
    };
  }

  try {
    const update = await auth.updateUser({ password: input.newPassword });
    if (!update || update.error) {
      return {
        ok: false,
        message: friendlyErrorMessage(update?.error, PASSWORD_CHANGE_FAILED_MESSAGE),
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: friendlyErrorMessage(error, PASSWORD_CHANGE_FAILED_MESSAGE),
    };
  }

  try {
    const signOut = await auth.signOut({ scope: "others" });
    if (!signOut || signOut.error) {
      return {
        ok: true,
        warning: friendlyErrorMessage(signOut?.error, OTHER_SESSIONS_SIGN_OUT_FAILED_MESSAGE),
      };
    }
  } catch (error) {
    return {
      ok: true,
      warning: friendlyErrorMessage(error, OTHER_SESSIONS_SIGN_OUT_FAILED_MESSAGE),
    };
  }

  return { ok: true, warning: null };
}
