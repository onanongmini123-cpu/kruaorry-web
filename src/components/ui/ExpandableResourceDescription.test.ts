import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpandableResourceDescription } from "./ExpandableResourceDescription";

describe("ExpandableResourceDescription", () => {
  it("starts collapsed with an independently labelled, keyboard-native toggle", () => {
    const html = renderToStaticMarkup(React.createElement(ExpandableResourceDescription, {
      title: "ใบงานการคูณ",
      description: "รายละเอียดจริงของสื่อที่อ่านต่อได้ภายในการ์ดเดิม",
    }));

    expect(html).toContain("รายละเอียดจริงของสื่อ");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('aria-label="ดูคำอธิบายเพิ่มเติมของ ใบงานการคูณ"');
    expect(html).toContain(">ดูเพิ่มเติม<");
    expect(html).not.toContain("href=");
    expect(html).not.toContain('role="dialog"');
  });

  it("keeps expansion local and compensates scroll only when collapsing", () => {
    const source = readFileSync(new URL("./ExpandableResourceDescription.tsx", import.meta.url), "utf8");

    expect(source).toContain("setExpanded((current) => !current)");
    expect(source).toContain('expanded ? "แสดงน้อยลง" : "ดูเพิ่มเติม"');
    expect(source).toContain("collapseButtonTop.current = buttonRef.current.getBoundingClientRect().top");
    expect(source).toContain("window.scrollBy(0, delta)");
    expect(source).not.toMatch(/router[.]|window[.]location|scrollIntoView/);
  });
});
