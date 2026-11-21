import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUNDER_FULL_NOTICE, FOUNDER_LIMIT_NOTICE, FOUNDER_LOW_SEATS_THRESHOLD, founderPublicNotice, founderSeatsBadge } from "../founderCapacity";

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

  it("the Founder card badge: the neutral limit normally, the places left only when 20 or fewer remain, full when none", () => {
    expect(FOUNDER_LOW_SEATS_THRESHOLD).toBe(20);
    expect(founderSeatsBadge({ isFull: false, remaining: 100 })).toBe("จำกัด 100 บัญชีแรก");
    expect(founderSeatsBadge({ isFull: false, remaining: 90 })).toBe(FOUNDER_LIMIT_NOTICE);
    expect(founderSeatsBadge({ isFull: false, remaining: 21 })).toBe("จำกัด 100 บัญชีแรก");
    expect(founderSeatsBadge({ isFull: false, remaining: 20 })).toBe("เหลืออีก 20 ที่");
    expect(founderSeatsBadge({ isFull: false, remaining: 5 })).toBe("เหลืออีก 5 ที่");
    expect(founderSeatsBadge({ isFull: false, remaining: 1 })).toBe("เหลืออีก 1 ที่");
    expect(founderSeatsBadge({ isFull: true, remaining: 0 })).toBe("เต็มแล้ว");
    expect(founderSeatsBadge({ isFull: false, remaining: 0 })).toBe("เต็มแล้ว");
  });

  it("never shows how many places are used, on any badge", () => {
    for (let remaining = 0; remaining <= 100; remaining++) {
      const badge = founderSeatsBadge({ isFull: remaining === 0, remaining });
      expect(badge, String(remaining)).not.toMatch(/ใช้ไป|\d+\s*\/\s*\d+/);
      const numbers = badge.match(/\d+/g) ?? [];
      // the only numbers that may appear are the limit (100) or the places left
      for (const n of numbers) expect([100, remaining]).toContain(Number(n));
    }
  });

  it("the membership page uses only that badge and never reads the used count", () => {
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
