import { isPermanentAuthUser } from "@/lib/authIdentity";

export const RECOVERY_LINK_ERROR_MESSAGE = "ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ";
export const RECOVERY_PASSWORD_ERROR_MESSAGE = "ยังตั้งรหัสผ่านใหม่ไม่ได้ กรุณาลองอีกครั้งหรือขอลิงก์ใหม่";

type RecoveryAuthBoundary = {
  verifyOtp: (input: { token_hash: string; type: "recovery" }) => PromiseLike<{ error?: unknown } | null | undefined>;
  exchangeCodeForSession: (code: string) => PromiseLike<{ error?: unknown } | null | undefined>;
  getUser: () => PromiseLike<{
    data?: { user?: { id: string; is_anonymous?: boolean } | null } | null;
    error?: unknown;
  } | null | undefined>;
  updateUser: (input: { password: string }) => PromiseLike<{ error?: unknown } | null | undefined>;
};

type RecoveryVerificationResult =
  | { ok: true }
  | { ok: false; message: typeof RECOVERY_LINK_ERROR_MESSAGE };

type RecoveryPasswordUpdateResult =
  | { ok: true; clearPasswords: true }
  | { ok: false; clearPasswords: true; message: typeof RECOVERY_PASSWORD_ERROR_MESSAGE };

type RecoveryHistoryBoundary = {
  readonly state?: unknown;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
};

/**
 * Remove one-time recovery credentials from both the address bar and the
 * current browser-history entry. This must run after the provider has consumed
 * the credential, whether verification succeeds or fails, so a token/code is
 * never left behind for later navigation, screenshots, or copied URLs.
 */
export function scrubRecoverySecrets(history: RecoveryHistoryBoundary): void {
  history.replaceState(history.state ?? null, "", "/reset-password");
}

export async function verifyRecoveryCredential(
  auth: Pick<RecoveryAuthBoundary, "verifyOtp" | "exchangeCodeForSession" | "getUser">,
  tokenHash: string | null,
  code: string | null,
): Promise<RecoveryVerificationResult> {
  try {
    if (tokenHash) {
      const result = await auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (!result || result.error) return { ok: false, message: RECOVERY_LINK_ERROR_MESSAGE };
    } else if (code) {
      const result = await auth.exchangeCodeForSession(code);
      if (!result || result.error) return { ok: false, message: RECOVERY_LINK_ERROR_MESSAGE };
    } else {
      return { ok: false, message: RECOVERY_LINK_ERROR_MESSAGE };
    }

    const result = await auth.getUser();
    if (result?.error || !isPermanentAuthUser(result?.data?.user)) {
      return { ok: false, message: RECOVERY_LINK_ERROR_MESSAGE };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: RECOVERY_LINK_ERROR_MESSAGE };
  }
}

export async function updateRecoveryPassword(
  auth: Pick<RecoveryAuthBoundary, "updateUser">,
  password: string,
  onLoadingChange: (loading: boolean) => void,
): Promise<RecoveryPasswordUpdateResult> {
  onLoadingChange(true);
  try {
    const result = await auth.updateUser({ password });
    if (!result || result.error) {
      return { ok: false, clearPasswords: true, message: RECOVERY_PASSWORD_ERROR_MESSAGE };
    }
    return { ok: true, clearPasswords: true };
  } catch {
    return { ok: false, clearPasswords: true, message: RECOVERY_PASSWORD_ERROR_MESSAGE };
  } finally {
    onLoadingChange(false);
  }
}
