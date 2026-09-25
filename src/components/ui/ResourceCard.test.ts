import { readFileSync } from "node:fs";
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
  it("renders the real cover lazily with a useful alt and an independent filled favorite heart", () => {
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
    expect(html).toContain('aria-label="นำออกจากสื่อโปรด"');
    expect(html).toContain('fill="currentColor"');
  });

  it("uses an outline heart and the exact add label when the resource is not saved", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, {
      ...baseProps,
      saved: false,
      onSave: vi.fn(),
    }));

    expect(html).toContain('aria-label="เพิ่มเป็นสื่อโปรด"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('fill="none"');
  });

  it("keeps the existing affordance icon as a fallback without a cover", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, baseProps));
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-gamepad-2");
  });

  it("falls back to the icon when a configured cover fails to load", () => {
    const source = readFileSync(new URL("./ResourceCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("onError={() => setFailedCoverUrl(coverImageUrl ?? null)}");
    expect(source).toContain("failedCoverUrl !== coverImageUrl");
  });

  it("shows a clamped inline description, new badge, grade, package, and stable locked CTA", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, {
      ...baseProps,
      description: "คำอธิบายฉบับเต็มที่เปิดอ่านต่อได้จากหน้ารายละเอียด",
      gradeLevels: ["p2"],
      requiredPlanNames: ["Founder 100", "Teacher"],
      locked: true,
      isNew: true,
      onClick: vi.fn(),
      onAction: vi.fn(),
    }));

    expect(html).toContain("คำอธิบายฉบับเต็ม");
    expect(html).toContain("ดูเพิ่มเติม");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">ใหม่<");
    expect(html).toContain("ป.2");
    expect(html).toContain("สำหรับ Founder 100 / Teacher");
    expect(html).toContain("อัปเกรดเพื่อปลดล็อก");
    expect(html).toMatch(/-webkit-line-clamp:\s*3/);
  });

  it("distinguishes an unavailable resource from a plan upgrade", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, {
      ...baseProps,
      locked: true,
      unavailable: true,
      onAction: vi.fn(),
    }));

    expect(html).toContain("ยังไม่เปิดให้ใช้งาน");
    expect(html).not.toContain("อัปเกรดเพื่อปลดล็อก");
    expect(html).not.toContain("สำหรับสมาชิก");
  });

  it("keeps an accessible favorite name while an optimistic save is pending", () => {
    const html = renderToStaticMarkup(React.createElement(ResourceCard, {
      ...baseProps,
      onSave: vi.fn(),
      savePending: true,
    }));
    expect(html).toContain('aria-label="เพิ่มเป็นสื่อโปรด"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });
});
