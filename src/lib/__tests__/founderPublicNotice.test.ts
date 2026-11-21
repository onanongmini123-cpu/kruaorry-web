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

  it("is the only Founder availability text on the landing and member pages", () => {
    for (const page of ["../../app/landing/PricingSection.tsx", "../../app/app/page.tsx"]) {
      const source = read(page);
      expect(source, page).toMatch(/founderPublicNotice\(|FOUNDER_LIMIT_NOTICE/);
      expect(source, page).not.toMatch(/ยืนยันชำระแล้ว\s*\{/);
      expect(source, page).not.toMatch(/เหลืออีก\s*\$\{/);
      expect(source, page).not.toMatch(/เหลือ\s*\$\{/);
      expect(source, page).not.toMatch(/\.(used|remaining)\b[^\n]*\/[^\n]*capacity/);
    }
  });

  it("the membership page shows the places left only as the Founder card badge (never the used count)", () => {
    const source = read("../../app/membership/page.tsx");
    expect(source).toContain("founderSeatsBadge(capacity)");
    expect(source).not.toMatch(/\.(used)\b/);
    expect(source).not.toMatch(/\.remaining\b/);
  });

  it("keeps the real seat count in the admin console", () => {
    const admin = read("../../app/admin/page.tsx");
    expect(admin).toContain("founderSeatsUsed");
    expect(admin).toContain("FOUNDER_CAPACITY_LIMIT");
  });
});
