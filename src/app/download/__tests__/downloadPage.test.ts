import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../[id]/page.tsx", import.meta.url), "utf8");

describe("download page route parameter", () => {
  it("only fetches a real resource id and never an arbitrary same-origin path", () => {
    expect(source).toContain("const RESOURCE_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;");
    expect(source).toContain("if (!validId) return;");
    expect(source).toContain("/api/resources/${encodeURIComponent(params.id)}/download");
    expect(source).not.toContain("/api/resources/${params.id}/download");
  });

  it("shows a friendly Thai message for an invalid id", () => {
    expect(source).toContain("ไม่พบไฟล์นี้ หรือรหัสสื่อไม่ถูกต้อง");
  });
});
