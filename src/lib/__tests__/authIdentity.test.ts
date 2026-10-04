import { describe, expect, it } from "vitest";
import { isPermanentAuthUser } from "../authIdentity";

describe("permanent auth identity", () => {
  it("keeps missing and Supabase anonymous identities in the guest state", () => {
    expect(isPermanentAuthUser(null)).toBe(false);
    expect(isPermanentAuthUser(undefined)).toBe(false);
    expect(isPermanentAuthUser({ id: "guest-1", is_anonymous: true })).toBe(false);
  });

  it("accepts permanent users whether Supabase returns false or omits the flag", () => {
    expect(isPermanentAuthUser({ id: "member-1", is_anonymous: false })).toBe(true);
    expect(isPermanentAuthUser({ id: "legacy-member" })).toBe(true);
  });
});
