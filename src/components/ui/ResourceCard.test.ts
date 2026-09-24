import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Gamepad2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ResourceCard } from "./ResourceCard";

const baseProps = {
  title: "โรงงานคำไทย",
  meta: "เกมภาษาไทย",
  affordance: "web_app" as const,
  tags: ["ภาษาไทย"],
  icon: Gamepad2,
};

describe("ResourceCard media", () => {
  it("renders the real cover lazily with a useful alt and an independent bookmark button", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, {
      ...baseProps,
      coverImageUrl: "https://example.com/cover.png",
      saved: true,
      onSave: vi.fn(),
    }));

    expect(html).toContain('src="https://example.com/cover.png"');
    expect(html).toContain('alt="ภาพปก โรงงานคำไทย"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('/></button><button type="button" aria-label="นำ โรงงานคำไทย ออกจากรายการที่บันทึก"');
  });

  it("keeps the existing affordance icon as a fallback without a cover", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, baseProps));
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-gamepad-2");
  });
});
