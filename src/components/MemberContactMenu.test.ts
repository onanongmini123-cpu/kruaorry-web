import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MemberContactMenu.tsx", import.meta.url), "utf8");

describe("MemberContactMenu accessibility", () => {
  it("uses a labelled popover and safe external links", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('referrerPolicy="no-referrer"');
  });

  it("closes with Escape and restores focus to the trigger", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("triggerRef.current?.focus()");
  });
});
