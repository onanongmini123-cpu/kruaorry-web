import { describe, expect, it } from "vitest";
import { isAuthenticatedAccount } from "../authUser";

describe("isAuthenticatedAccount", () => {
  it("accepts only a real signed-in account", () => {
    expect(isAuthenticatedAccount({ id: "member-1" })).toBe(true);
    expect(isAuthenticatedAccount({ id: "member-1", is_anonymous: false })).toBe(true);
    expect(isAuthenticatedAccount({ id: "guest", is_anonymous: true })).toBe(false);
    expect(isAuthenticatedAccount(null)).toBe(false);
    expect(isAuthenticatedAccount(undefined)).toBe(false);
  });
});
