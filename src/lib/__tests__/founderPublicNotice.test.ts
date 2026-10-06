import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUNDER_FULL_NOTICE, FOUNDER_LIMIT_NOTICE, founderPublicNotice } from "../founderCapacity";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Founder public notice", () => {
  it("shows neutral limit copy while places remain, and plain full copy when sold out", () => {
    expect(FOUNDER_LIMIT_NOTICE).toBe("จำกัด 100 บัญชีแรก");
    expect(founderPublicNotice({ isFull: false })).toBe("จำกัด 100 บัญชีแรก");
    expect(founderPublicNotice({ isFull: true })).toBe(FOUNDER_FULL_NOTICE);
    expect(founderPublicNotice({ isFull: false })).not.toMatch(/\d+\s*\/\s*\d+|เหลือ/);
  });

  it("is the only Founder availability text on landing, member and membership pages", () => {
    for (const page of ["../../app/page.tsx", "../../app/app/page.tsx", "../../app/membership/page.tsx"]) {
      const source = read(page);
      expect(source, page).toContain("founderPublicNotice(");
      expect(source, page).not.toMatch(/ยืนยันชำระแล้ว\s*\{/);
      expect(source, page).not.toMatch(/เหลืออีก\s*\$\{/);
      expect(source, page).not.toMatch(/เหลือ\s*\$\{/);
      expect(source, page).not.toMatch(/\.(used|remaining)\b[^\n]*\/[^\n]*capacity/);
    }
  });

  it("keeps the real seat count in the admin console", () => {
    const admin = read("../../app/admin/page.tsx");
    expect(admin).toContain("founderSeatsUsed");
    expect(admin).toContain("FOUNDER_CAPACITY_LIMIT");
  });
});
