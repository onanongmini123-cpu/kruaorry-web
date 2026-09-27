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
    expect(safeAuthNext("/app?view=favorites")).toBe("/app?view=favorites");
    expect(safeAuthNext("/app?view=library&q=%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B9%84%E0%B8%97%E0%B8%A2&category=%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99&grade=p2"))
      .toBe("/app?view=library&q=%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B9%84%E0%B8%97%E0%B8%A2&category=%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99&grade=p2");
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
    "/app?view=admin",
    "/app?view=favorites&view=library",
    "/app?view=library&grade=p2&grade=p3",
    "/app?view=library&grade=%E0%B8%9B.2",
    "/app?view=library&unknown=value",
    "/app#fragment",
  ])("falls back to /app for an unsafe destination: %s", (raw) => {
    expect(safeAuthNext(raw)).toBe("/app");
  });
});
