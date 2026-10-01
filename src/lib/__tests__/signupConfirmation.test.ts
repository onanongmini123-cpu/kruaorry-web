import { describe, expect, it } from "vitest";
import {
  SIGNUP_PASSWORD_MISMATCH_MESSAGE,
  validateSignupPasswordConfirmation,
} from "../signupConfirmation";

describe("signup password confirmation", () => {
  it("accepts an exact password match", () => {
    expect(validateSignupPasswordConfirmation("secret123", "secret123")).toBeNull();
  });

  it("rejects a mismatch with the Thai form error", () => {
    expect(validateSignupPasswordConfirmation("secret123", "secret124"))
      .toBe(SIGNUP_PASSWORD_MISMATCH_MESSAGE);
  });

  it("does not trim either password before comparing", () => {
    expect(validateSignupPasswordConfirmation("secret123", "secret123 "))
      .toBe(SIGNUP_PASSWORD_MISMATCH_MESSAGE);
  });
});
