import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResourceCard } from "@/components/ui/ResourceCard";
import { EMPTY_ENTITLEMENTS } from "@/lib/entitlement";
import { groupPreviewRows, isPreviewImageUrl } from "@/lib/resourcePreviews";
import { drawWatermark, previewSize, watermarkLayout, WATERMARK_TEXT } from "@/lib/previewWatermark";
import { PUBLIC_RESOURCE_SELECT, PUBLIC_RESOURCE_SELECT_WITH_SLUG, publicResourceAction, toPublicResource, type PublicResource, type PublicResourceViewer } from "../catalog";
import { TrialPreview } from "../[key]/TrialPreview";
import { movePreview } from "@/app/admin/AdminResourcePreviewsField";

const ID = "11111111-2222-4333-8444-555555555555";
const SECRET_URL = "https://games.kruaorry.com/secret-pro-game-abcd/";
const SECRET_FILE = `${ID}/secret-teacher-pack.pdf`;
const PREVIEW = "https://abc.supabase.co/storage/v1/object/public/resource-covers/previews/r/a.webp";

// A catalogue row exactly as the public view returns it, plus the private fields
// that must never be selected, read or rendered.
const proRow = {
  id: ID, status: "published", title: "ชุดสื่อ Pro", meta: "", description: "", category: "ภาษาอังกฤษ",
  delivery_mode: "file_download", cover_image_url: null, tags: [], grade_levels: ["p1"],
  access_mode: "plans", required_plan_ids: ["founder", "teacher"], required_plan_names: ["Founder 100", "Teacher Pro"],
  is_free: false, is_new: false, featured_rank: null, review_average: null, review_count: 0,
  cta_url: SECRET_URL, file_path: SECRET_FILE, file_name: "secret-teacher-pack.pdf",
};

function pro(over: Partial<PublicResource> = {}): PublicResource {
  return { ...(toPublicResource(proRow) as PublicResource), previewImages: [PREVIEW], trialAvailable: true, ...over };
}
const visitor = (over: Partial<PublicResourceViewer> = {}): PublicResourceViewer => ({ authenticated: false, role: null, entitlements: EMPTY_ENTITLEMENTS, ...over });
const proMember = visitor({ authenticated: true, role: "member", entitlements: { planId: "teacher", features: {} } });
const founderMember = visitor({ authenticated: true, role: "member", entitlements: { planId: "founder", features: {} } });

describe("a real file or link never reaches someone who is not Pro", () => {
  it("the public catalogue select never asks for the destination", () => {
    for (const select of [PUBLIC_RESOURCE_SELECT, PUBLIC_RESOURCE_SELECT_WITH_SLUG]) {
      expect(select).not.toMatch(/cta_url|file_path|file_name|storage/);
    }
  });

  it("the public resource object carries no destination even if the row had one", () => {
    const serialized = JSON.stringify(pro());
    expect(serialized).not.toContain(SECRET_URL);
    expect(serialized).not.toContain(SECRET_FILE);
    expect(serialized).not.toContain("secret-teacher-pack");
    expect(Object.keys(pro())).not.toEqual(expect.arrayContaining(["cta_url", "ctaUrl", "filePath", "file_path"]));
  });

  it("the main button of a Pro resource points visitors and free members to the membership page, never to open/download", () => {
    for (const viewer of [visitor(), visitor({ authenticated: true, role: "member" })]) {
      for (const deliveryMode of ["file_download", "google_template", "web_app"] as const) {
        const action = publicResourceAction(pro({ deliveryMode }), viewer);
        expect(action.canUse).toBe(false);
        expect(action.locked).toBe(true);
        expect(action.href.startsWith("/membership")).toBe(true);
        expect(action.href).not.toMatch(/\/api\/resources|\/download\//);
        expect(action.opensNewTab).toBe(false);
      }
    }
  });

  it("the trial section renders pictures and one membership link, with no destination", () => {
    const action = publicResourceAction(pro(), visitor());
    const html = renderToStaticMarkup(React.createElement(TrialPreview, { images: pro().previewImages, resourceTitle: "ชุดสื่อ Pro", upgradeHref: action.href }));
    expect(html).toContain("ทดลองดูตัวอย่าง");
    expect(html).toContain("KruAorry.com – ตัวอย่าง");
    expect(html).toContain(PREVIEW);
    expect(html).toContain('href="/membership');
    expect(html).not.toMatch(/\/api\/resources|\/download\/|games\.kruaorry\.com|secret/);
    expect(html.match(/href="/g)).toHaveLength(1);
    expect(html).not.toContain("download=");
  });

  it("renders nothing without previews", () => {
    expect(renderToStaticMarkup(React.createElement(TrialPreview, { images: [], resourceTitle: "x", upgradeHref: "/membership" }))).toBe("");
  });
});

describe("Pro and Founder members behave as before", () => {
  it("can open the resource through the authorized routes, and the trial section is for people who cannot", () => {
    for (const viewer of [proMember, founderMember]) {
      const download = publicResourceAction(pro(), viewer);
      expect(download).toMatchObject({ canUse: true, locked: false, href: `/download/${ID}`, opensNewTab: true });
      expect(publicResourceAction(pro({ deliveryMode: "web_app" }), viewer).href).toBe(`/api/resources/${ID}/open`);
    }
    // The page shows the trial section only when accessMode is plans and the viewer cannot use it.
    expect(publicResourceAction(pro(), proMember).canUse).toBe(true);
  });

  it("a free resource is unchanged: no previews, no badge, free members can use it", () => {
    const free = toPublicResource({ ...proRow, access_mode: "authenticated", required_plan_ids: [], required_plan_names: [], is_free: true }) as PublicResource;
    expect(free.previewImages).toEqual([]);
    expect(free.trialAvailable).toBe(false);
    expect(publicResourceAction(free, visitor({ authenticated: true, role: "member" })).canUse).toBe(true);
  });
});

describe("'ทดลองได้' badge", () => {
  const card = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ResourceCard, {
    title: "ชุดสื่อ", deliveryMode: "file_download", accessTier: "pro", href: `/resources/${ID}`, ...props,
  }));

  it("shows only on a Pro card that has previews", () => {
    expect(card({ trialAvailable: true })).toContain("ทดลองได้");
    expect(card({ trialAvailable: false })).not.toContain("ทดลองได้");
    expect(card({})).not.toContain("ทดลองได้");
    expect(card({ trialAvailable: true, accessTier: "free" })).not.toContain("ทดลองได้");
    expect(card({ trialAvailable: true, accessTier: "member" })).not.toContain("ทดลองได้");
  });
});

describe("preview data", () => {
  it("accepts only https images inside the previews folder of the public cover bucket", () => {
    expect(isPreviewImageUrl(PREVIEW)).toBe(true);
    for (const bad of [
      "http://abc.supabase.co/storage/v1/object/public/resource-covers/previews/a.webp",
      "https://evil.example/a.png",
      "https://abc.supabase.co/storage/v1/object/public/resource-files/previews/a.webp",
      "https://abc.supabase.co/storage/v1/object/public/resource-covers/other/a.webp",
      "https://u:p@abc.supabase.co/storage/v1/object/public/resource-covers/previews/a.webp",
      `https://abc.supabase.co/storage/v1/object/public/resource-covers/previews/${"x".repeat(500)}`,
      null, 5, "",
    ]) expect(isPreviewImageUrl(bad)).toBe(false);
  });

  it("groups rows by resource in position order, dropping malformed rows and capping at six", () => {
    const rows = [
      { resource_id: "a", position: 2, image_url: PREVIEW.replace("a.webp", "2.webp") },
      { resource_id: "a", position: 1, image_url: PREVIEW },
      { resource_id: "a", position: 3, image_url: "https://evil.example/x.png" },
      { resource_id: "a", position: 0, image_url: PREVIEW },
      { resource_id: "b", position: 1, image_url: PREVIEW },
      null, "x",
      ...Array.from({ length: 8 }, (_, i) => ({ resource_id: "c", position: i + 1, image_url: PREVIEW.replace("a.webp", `${i}.webp`) })),
    ];
    const grouped = groupPreviewRows(rows);
    expect(grouped.get("a")).toEqual([PREVIEW, PREVIEW.replace("a.webp", "2.webp")]);
    expect(grouped.get("b")).toEqual([PREVIEW]);
    expect(grouped.get("c")).toHaveLength(6);
    expect(groupPreviewRows(null).size).toBe(0);
  });

  it("moves a preview up or down and ignores moves off the ends", () => {
    expect(movePreview(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(movePreview(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(movePreview(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(movePreview(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("watermark", () => {
  it("scales large pictures down and leaves small ones alone", () => {
    expect(previewSize(4000, 2000)).toEqual({ width: 1280, height: 640 });
    expect(previewSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(previewSize(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("tiles the text across the whole picture including every corner, so a crop still carries it", () => {
    const { tiles, fontSize, angleRadians, width, height } = watermarkLayout(1000, 700);
    expect(fontSize).toBeGreaterThanOrEqual(16);
    // Every picture corner, rotated into the tiles' coordinate system, has a tile within one step.
    const stepX = fontSize * 11;
    const stepY = fontSize * 4;
    for (const [cx, cy] of [[0, 0], [width, 0], [0, height], [width, height], [width / 2, height / 2]]) {
      const dx = cx - width / 2;
      const dy = cy - height / 2;
      const x = dx * Math.cos(-angleRadians) - dy * Math.sin(-angleRadians);
      const y = dx * Math.sin(-angleRadians) + dy * Math.cos(-angleRadians);
      expect(tiles.some((t) => Math.abs(t.x - x) <= stepX && Math.abs(t.y - y) <= stepY)).toBe(true);
    }
    expect(WATERMARK_TEXT).toBe("KruAorry.com – ตัวอย่าง");
  });

  it("draws the exact text for every tile on a canvas context", () => {
    const calls: string[] = [];
    const context = {
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      strokeText: (text: string) => calls.push(`stroke:${text}`),
      fillText: (text: string) => calls.push(`fill:${text}`),
    } as unknown as CanvasRenderingContext2D;
    drawWatermark(context, 800, 600);
    const tiles = watermarkLayout(800, 600).tiles.length;
    expect(calls.filter((call) => call === `fill:${WATERMARK_TEXT}`)).toHaveLength(tiles);
    expect(calls.filter((call) => call === `stroke:${WATERMARK_TEXT}`)).toHaveLength(tiles);
  });
});
