export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_MIN_LENGTH_HINT = `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`;
export const PASSWORD_MIN_LENGTH_MESSAGE = `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`;

type AuthEntryMode = "signin" | "signup";

export function validateNewPasswordLength(password: string): string | null {
  return password.length >= PASSWORD_MIN_LENGTH ? null : PASSWORD_MIN_LENGTH_MESSAGE;
}

export function validateAuthEntryPassword(mode: AuthEntryMode, password: string): string | null {
  return mode === "signup" ? validateNewPasswordLength(password) : null;
}

export function passwordMinLengthForAuthMode(mode: AuthEntryMode): number | undefined {
  return mode === "signup" ? PASSWORD_MIN_LENGTH : undefined;
}
