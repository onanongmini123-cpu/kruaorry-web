import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_HINT,
  PASSWORD_MIN_LENGTH_MESSAGE,
  passwordMinLengthForAuthMode,
  validateAuthEntryPassword,
  validateNewPasswordLength,
} from "../passwordPolicy";

describe("password minimum length policy", () => {
  it("uses eight characters in the shared Thai hint and error", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MIN_LENGTH_HINT).toBe(`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
    expect(PASSWORD_MIN_LENGTH_MESSAGE)
      .toBe(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
  });

  it("rejects a new password one character below the minimum", () => {
    expect(validateNewPasswordLength("a".repeat(PASSWORD_MIN_LENGTH - 1)))
      .toBe(PASSWORD_MIN_LENGTH_MESSAGE);
  });

  it("accepts a new password at the minimum", () => {
    expect(validateNewPasswordLength("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it("applies the minimum to sign-up but never to sign-in", () => {
    const shortExistingPassword = "a".repeat(PASSWORD_MIN_LENGTH - 1);

    expect(validateAuthEntryPassword("signup", shortExistingPassword))
      .toBe(PASSWORD_MIN_LENGTH_MESSAGE);
    expect(passwordMinLengthForAuthMode("signup")).toBe(PASSWORD_MIN_LENGTH);
    expect(validateAuthEntryPassword("signin", shortExistingPassword)).toBeNull();
    expect(passwordMinLengthForAuthMode("signin")).toBeUndefined();
  });
});
