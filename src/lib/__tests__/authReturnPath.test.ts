import { describe, expect, it } from "vitest";
import { safeAuthNext } from "../authReturnPath";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("safeAuthNext", () => {
  it("accepts the known app and resource destinations", () => {
    expect(safeAuthNext("/app")).toBe("/app");
    expect(safeAuthNext(`/app?resource=${id}`)).toBe(`/app?resource=${id}`);
    expect(safeAuthNext(`/download/${id}`)).toBe(`/download/${id}`);
    expect(safeAuthNext(`/download/${id}?name=${encodeURIComponent("ใบงานภาษาไทย.pdf")}&autoclose=1`))
      .toBe(`/download/${id}?name=${encodeURIComponent("ใบงานภาษาไทย.pdf")}&autoclose=1`);
  });

  it.each([
    null,
    "",
    "https://evil.example/app",
    "//evil.example/path",
    "/\\evil.example/path",
    "/admin",
    "/auth/callback",
    "/download/not-a-uuid",
    `/download/${id}?autoclose=0`,
    `/download/${id}?name=a%2Fb.pdf`,
    `/download/${id}?name=a&name=b`,
    `/app?resource=${id}&redirect=https%3A%2F%2Fevil.example`,
    `/app?resource=bad`,
    "/app#fragment",
  ])("falls back to /app for an unsafe destination: %s", (raw) => {
    expect(safeAuthNext(raw)).toBe("/app");
  });
});
