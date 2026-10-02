export const SIGNUP_PASSWORD_MISMATCH_MESSAGE = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";

export function validateSignupPasswordConfirmation(password: string, confirmation: string): string | null {
  return password === confirmation ? null : SIGNUP_PASSWORD_MISMATCH_MESSAGE;
}
