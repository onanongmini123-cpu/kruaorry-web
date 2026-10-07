import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResourceCard, type ResourceCardProps } from "./ResourceCard";

const base: ResourceCardProps = {
  title: "โรงงานคำไทย",
  deliveryMode: "web_app",
  accessTier: "free",
  href: "/resources/11111111-2222-4333-8444-555555555555",
};

function render(props: Partial<ResourceCardProps> = {}) {
  return renderToStaticMarkup(React.createElement(ResourceCard, { ...base, ...props }));
}

describe("ResourceCard content contract", () => {
  it("shows cover, title, a short blurb, grade, subject, type, access badge and one CTA", () => {
    const html = render({
      description: "คำอธิบาย",
      gradeLevels: ["p4", "p5", "p6"],
      category: "ภาษาอังกฤษ",
      meta: "เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · 3 ระดับ · เดี่ยว/2 คน · ป.2–ม.3",
      coverImageUrl: "https://images.example.org/c.png",
      isNew: true,
    });
    expect(html).toContain('src="https://images.example.org/c.png"');
    expect(html).toContain("โรงงานคำไทย");
    expect(html).toContain("คำอธิบาย");
    expect(html).toContain("ป.4–6");
    expect(html).toContain("ภาษาอังกฤษ");
    expect(html).toContain("เกมและสื่อออนไลน์");
    expect(html).toContain("ใช้ฟรี");
    expect(html).toContain(">ใหม่<");
    expect(html).toContain("ดูรายละเอียด");
    expect(html.match(/>ดูรายละเอียด</g)).toHaveLength(1);
  });

  it("shows at most two highlight metrics and never grade text taken from the meta line", () => {
    const html = render({ meta: "เว็บเกม · 810 ประโยค · 6 โครงสร้าง · 3 ระดับ · ป.2–ม.3", gradeLevels: ["p2"] });
    expect(html).toContain("810 ประโยค · 6 โครงสร้าง");
    expect(html).not.toContain("3 ระดับ");
    expect(html).not.toContain("ป.2–ม.3");
  });

  it("never puts a long description on the card", () => {
    const long = "ก".repeat(900);
    const html = render({ description: long });
    expect(html).not.toContain("ก".repeat(200));
    expect(html).toContain("…");
  });

  it("has no inline expand control, so the card stays the same height", () => {
    const html = render({ description: "ข้อความ ".repeat(200) });
    expect(html).not.toContain("ดูเพิ่มเติม");
    expect(html).not.toContain("aria-expanded");
  });

  it("links to the detail page once for pointer users and keeps keyboard order clean", () => {
    const html = render();
    const hrefs = html.match(/href="\/resources\/11111111-2222-4333-8444-555555555555"/g) ?? [];
    expect(hrefs.length).toBe(3);
    // The cover and the "ดูรายละเอียด" button are pointer-only duplicates: out of the tab order and
    // hidden from assistive tech. The title is the one link a keyboard or screen reader meets.
    const anchors = html.match(/<a\b[^>]*>/g) ?? [];
    const pointerOnly = anchors.filter((tag) => /tabindex="-1"/.test(tag) && /aria-hidden="true"/.test(tag));
    expect(pointerOnly).toHaveLength(2);
    const reachable = anchors.filter((tag) => !/tabindex="-1"/.test(tag));
    expect(reachable).toHaveLength(1);
    expect(html).toMatch(/<h3[^>]*class="kru-resource-card__title"[^>]*><a[^>]*>โรงงานคำไทย<\/a><\/h3>/);
  });

  it("uses a second-level heading when the cards follow the page title directly", () => {
    const html = render({ headingLevel: 2 });
    expect(html).toMatch(/<h2[^>]*class="kru-resource-card__title"/);
    expect(html).not.toContain("<h3");
  });

  it("uses an in-app button when there is no detail page to link to", () => {
    const onSelect = vi.fn();
    const html = render({ href: undefined, onSelect });
    expect(html).not.toContain("<a ");
    expect(html).toContain("<button");
    expect(html).toContain("ดูรายละเอียด");
  });
});

describe("ResourceCard media and favourites", () => {
  it("renders the real cover lazily with a useful alt", () => {
    const html = render({ coverImageUrl: "https://example.com/cover.png" });
    expect(html).toContain('alt="ภาพปก โรงงานคำไทย"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("loads the first row eagerly when marked as priority", () => {
    expect(render({ coverImageUrl: "https://example.com/cover.png", priority: true })).toContain('loading="eager"');
  });

  it("falls back to the delivery-mode icon without a cover", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-gamepad-2");
  });

  it("renders a filled, labelled heart when saved and an outline one when not", () => {
    const saved = render({ saved: true, onSave: vi.fn() });
    expect(saved).toContain('aria-pressed="true"');
    expect(saved).toContain('aria-label="นำออกจากสื่อโปรด"');
    expect(saved).toContain('fill="currentColor"');
    const unsaved = render({ saved: false, onSave: vi.fn() });
    expect(unsaved).toContain('aria-pressed="false"');
    expect(unsaved).toContain('aria-label="เพิ่มเป็นสื่อโปรด"');
    expect(unsaved).toContain('fill="none"');
    expect(render()).not.toContain("aria-pressed");
  });

  it("keeps the heart a sibling of the link so it is never nested interactive content", () => {
    const html = render({ onSave: vi.fn() });
    const cover = html.indexOf("kru-resource-card__cover");
    const save = html.indexOf("kru-resource-card__save");
    expect(cover).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(cover);
    const coverEnd = html.indexOf("</a>", cover);
    expect(save).toBeGreaterThan(coverEnd);
  });
});

describe("ResourceCard access badge", () => {
  it("is driven only by accessTier; locked affects the cover, never the badge", () => {
    const entitled = render({ accessTier: "pro", locked: false });
    const notEntitled = render({ accessTier: "pro", locked: true });
    expect(entitled).toContain("Teacher Pro");
    expect(notEntitled).toContain("Teacher Pro");
    expect(notEntitled).toContain("kru-resource-card__lock");
    expect(entitled).not.toContain("kru-resource-card__lock");
    expect(render({ accessTier: "member", locked: true })).not.toContain("Teacher Pro");
  });

  it("labels every tier with the single set of customer words", () => {
    expect(render({ accessTier: "free" })).toContain("ใช้ฟรี");
    expect(render({ accessTier: "member" })).toContain("สมาชิกฟรี");
    expect(render({ accessTier: "pro" })).toContain("Teacher Pro");
    expect(render({ accessTier: "unavailable" })).toContain("ยังไม่เปิดให้ใช้งาน");
  });

  it("announces the real unlocking plans for Pro without changing the visible badge", () => {
    const html = render({ accessTier: "pro", requiredPlanNames: ["Founder 100", "Teacher Pro"] });
    expect(html).toContain("Founder 100 / Teacher Pro");
    expect(render({ accessTier: "free", requiredPlanNames: ["Founder 100"] })).not.toContain("Founder 100");
  });
});

describe("ResourceCard source hygiene", () => {
  const source = readFileSync(new URL("./ResourceCard.tsx", import.meta.url), "utf8");

  it("does not depend on viewer state for tier wording", () => {
    expect(source).not.toMatch(/locked\s*\?[^:]*ACCESS_TIER_LABEL/);
    expect(source).not.toContain("สำหรับสมาชิก");
    expect(source).not.toMatch(/พรีเมียม|Premium/i);
  });
});
