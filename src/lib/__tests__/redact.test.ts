import { describe, expect, it } from "vitest";
import { redactSensitive } from "../redact";

describe("redactSensitive", () => {
  it("redacts a full URL, including a signed-URL token query param", () => {
    const input = "fetch failed: https://xyz.supabase.co/storage/v1/object/sign/resource-files/r1/file.pdf?token=SUPER-SECRET";
    const result = redactSensitive(input);
    expect(result).not.toMatch(/SUPER-SECRET/);
    expect(result).not.toMatch(/https?:\/\//);
  });

  it("redacts a bearer token", () => {
    const input = "unauthorized: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const result = redactSensitive(input);
    expect(result).not.toMatch(/eyJ/);
    expect(result).toMatch(/Bearer \[redacted\]/);
  });

  it("redacts a JWT-like value even without a Bearer prefix", () => {
    const input = "session invalid: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U was rejected";
    const result = redactSensitive(input);
    expect(result).not.toMatch(/eyJ/);
  });

  it("redacts token/access_token/apikey query-param-style values", () => {
    expect(redactSensitive("bad request: token=abc123SECRET")).not.toMatch(/abc123SECRET/);
    expect(redactSensitive("bad request: access_token=abc123SECRET")).not.toMatch(/abc123SECRET/);
    expect(redactSensitive("bad request: apikey=abc123SECRET")).not.toMatch(/abc123SECRET/);
  });

  it("leaves an ordinary, non-sensitive message untouched", () => {
    expect(redactSensitive("object not found")).toBe("object not found");
    expect(redactSensitive("row-level security violation")).toBe("row-level security violation");
  });

  it("redacts multiple sensitive fragments in the same message", () => {
    const input = "GET https://api.example.com/x?token=AAA failed, retry with Bearer BBB.CCC.DDD";
    const result = redactSensitive(input);
    expect(result).not.toMatch(/AAA/);
    expect(result).not.toMatch(/BBB/);
    expect(result).not.toMatch(/https?:\/\//);
  });
});
