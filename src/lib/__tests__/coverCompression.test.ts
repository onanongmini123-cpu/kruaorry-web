import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminCoverCompressPanel, checkToolReadiness, setCover } from "@/app/admin/AdminCoverCompressPanel";
import {
  backupCsv, COMPRESS_THRESHOLD_BYTES, COVER_CACHE_CONTROL, coverObjectPath, estimateAfterBytes, isCompressedCoverUrl, newCompressedPath,
  parseBackupCsv, planCompression, selectCompressionBatch, totals,
} from "@/lib/coverCompression";

const BASE = "https://abc.supabase.co/storage/v1/object/public/resource-covers/";
const ID = "4cf231ef-9488-4239-b633-96393c251a72";
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("cover URLs", () => {
  it("reads the object path only for public links of this bucket", () => {
    expect(coverObjectPath(`${BASE}1790-a.png`)).toBe("1790-a.png");
    expect(coverObjectPath(`${BASE}folder/b%20c.webp`)).toBe("folder/b c.webp");
    for (const bad of ["https://evil.example/x.png", "http://abc.supabase.co/storage/v1/object/public/resource-covers/a.png", `${BASE}../secret`, `${BASE}`, null, 5, "https://u:p@abc.supabase.co/storage/v1/object/public/resource-covers/a.png"]) {
      expect(coverObjectPath(bad), String(bad)).toBeNull();
    }
  });
  it("recognises re-saved covers and makes unique v2 names", () => {
    expect(isCompressedCoverUrl(`${BASE}v2/x.webp`)).toBe(true);
    expect(isCompressedCoverUrl(`${BASE}x.webp`)).toBe(false);
    expect(newCompressedPath("u-1")).toBe("v2/u-1.webp");
    expect(COVER_CACHE_CONTROL).toBe("31536000");
  });
});

describe("planCompression", () => {
  const rows = [
    { id: "1", title: "ใหญ่", cover_image_url: `${BASE}big.png` },
    { id: "2", title: "เล็ก", cover_image_url: `${BASE}small.webp` },
    { id: "3", title: "ทำแล้ว", cover_image_url: `${BASE}v2/done.webp` },
    { id: "4", title: "นอกบัคเก็ต", cover_image_url: "https://kruaorry-web.vercel.app/images/a.jpg" },
    { id: "5", title: "ไม่มีรูป", cover_image_url: null },
    { id: "6", title: "ใหญ่รอง", cover_image_url: `${BASE}mid.jpg` },
    { id: "7", title: "ไม่รู้ขนาด", cover_image_url: `${BASE}unknown.png` },
  ];
  const sizes = new Map([["big.png", 2_000_000], ["small.webp", COMPRESS_THRESHOLD_BYTES], ["v2/done.webp", 900_000], ["mid.jpg", 400_000]]);
  it("offers only used, big, not-yet-re-saved covers of this bucket, biggest first", () => {
    const plan = planCompression(rows, sizes);
    expect(plan.map((c) => c.id)).toEqual(["1", "6"]);
    expect(plan[0]).toMatchObject({ bytes: 2_000_000, estimatedAfterBytes: estimateAfterBytes(2_000_000) });
    expect(totals(plan)).toEqual({ count: 2, before: 2_400_000, after: 2 * 65 * 1024 });
    expect(estimateAfterBytes(20_000)).toBe(20_000);
  });
  it("selects exactly one, five, twenty or all largest eligible covers for a round", () => {
    const many = Array.from({ length: 22 }, (_, index) => ({
      id: String(index), title: `ตัวอย่าง ${index}`, cover_image_url: `${BASE}${index}.png`,
    }));
    const sizes = new Map(many.map((row, index) => [`${index}.png`, 1_000_000 - index * 10_000]));
    const planned = planCompression(many, sizes);
    expect([1, 5, 20, "all"].map((size) => selectCompressionBatch(planned, size as 1 | 5 | 20 | "all").length)).toEqual([1, 5, 20, 22]);
    expect(selectCompressionBatch(planned, 5).map((item) => item.id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(selectCompressionBatch(planned, 5)[0].bytes).toBeGreaterThan(selectCompressionBatch(planned, 5)[4].bytes);
    expect(selectCompressionBatch([...planned].reverse(), 1)[0].id).toBe("0");
    const afterFirstRound = planCompression(many.map((row, index) => index === 0 ? { ...row, cover_image_url: `${BASE}v2/done.webp` } : row), sizes);
    expect(selectCompressionBatch(afterFirstRound, 1)[0].id).toBe("1");
    expect(selectCompressionBatch([], 1)).toEqual([]);
  });
});

describe("backup file", () => {
  it("round-trips ids, Thai titles with commas and quotes, and the original links", () => {
    const rows = [{ id: ID, title: 'เกม "A", B', url: `${BASE}a.png` }, { id: "36dfdf68-ab8c-4600-b969-d3e971458a49", title: "สอง", url: `${BASE}b.jpg` }];
    const csv = backupCsv(rows);
    expect(csv.startsWith("﻿id,title,cover_image_url")).toBe(true);
    expect(parseBackupCsv(csv)).toEqual({ rows: rows.map((r) => ({ id: r.id, url: r.url })), rejected: 0 });
  });
  it("never accepts a link to another site, a re-saved link, or a bad id", () => {
    const csv = `id,title,cover_image_url\r\n${ID},x,"https://evil.example/a.png"\r\nnot-an-id,x,"${BASE}a.png"\r\n${ID},x,"${BASE}v2/a.webp"\r\n${ID},ok,"${BASE}ok.png"\r\n`;
    expect(parseBackupCsv(csv)).toEqual({ rows: [{ id: ID, url: `${BASE}ok.png` }], rejected: 3 });
  });
});

// A tiny fake of the database client: one resource, the cover function and the read the tool makes.
function fakeClient(opts: { rpcError?: { code?: string; message: string } } = {}) {
  const state = { cover_image_url: `${BASE}old.png`, title: "สื่อ" };
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { ...state }, error: null }) }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (opts.rpcError) return { error: opts.rpcError };
      if (name === "admin_set_resource_cover") state.cover_image_url = String(args.p_cover_url);
      return { error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls, state };
}

describe("saving only the cover (admin_set_resource_cover)", () => {
  it("calls the cover-only function with just the id and the link, and returns the previous cover for the backup", async () => {
    const { client, calls, state } = fakeClient();
    await expect(setCover(client, ID, `${BASE}v2/n.webp`)).resolves.toEqual({ ok: true, previous: `${BASE}old.png` });
    expect(calls).toEqual([{ name: "admin_set_resource_cover", args: { p_resource_id: ID, p_cover_url: `${BASE}v2/n.webp` } }]);
    expect(state.cover_image_url).toBe(`${BASE}v2/n.webp`);
  });
  it("reports a refusal from the database without any second write", async () => {
    const { client, calls } = fakeClient({ rpcError: { code: "22023", message: "Cover file not found in resource-covers" } });
    await expect(setCover(client, ID, `${BASE}v2/x.webp`)).resolves.toEqual({ ok: false, reason: "บันทึกไม่สำเร็จ: Cover file not found in resource-covers" });
    expect(calls).toHaveLength(1);
  });
  it("tells whether migration 063 is installed before anything is uploaded", async () => {
    const ready = fakeClient({ rpcError: { code: "P0002", message: "Resource not found" } });
    await expect(checkToolReadiness(ready.client)).resolves.toBe("ready");
    expect(ready.calls[0].args.p_cover_url).toBe("https://example.invalid/");
    await expect(checkToolReadiness(fakeClient({ rpcError: { code: "PGRST202", message: "Could not find the function public.admin_set_resource_cover" } }).client)).resolves.toBe("missing");
    await expect(checkToolReadiness(fakeClient({ rpcError: { code: "42501", message: "Admin access required" } }).client)).resolves.toBe("not_admin");
    await expect(checkToolReadiness(fakeClient({ rpcError: { message: "network down" } }).client)).resolves.toBe("unknown");
    await expect(checkToolReadiness(fakeClient().client)).resolves.toBe("unknown");
  });
  it("never uses the full-save function, never deletes files, and checks readiness before upload", () => {
    const source = read("src/app/admin/AdminCoverCompressPanel.tsx");
    expect(source).not.toContain("admin_save_resource");
    expect(source).toContain("admin_set_resource_cover");
    expect(source.indexOf("checkToolReadiness(supabase)")).toBeLessThan(source.indexOf(".upload("));
    expect(source).toContain("!backupReady");
  });
});

describe("panel and upload settings", () => {
  it("renders the tool with its safety wording and the rollback section", () => {
    const html = renderToStaticMarkup(React.createElement(AdminCoverCompressPanel, { supabase: {} as SupabaseClient }));
    expect(html).toContain("บีบอัดรูปปกเดิม");
    expect(html).toContain("ไฟล์เดิมไม่ถูกลบ");
    expect(html).toContain("ไม่ใช้กุญแจลับ");
    expect(html).toContain("ย้อนกลับ");
    expect(html).toContain("ตรวจรายการรูปที่ควรบีบอัด");
  });
  it("the tool never deletes files and separates backup from the gated first upload", () => {
    const source = read("src/app/admin/AdminCoverCompressPanel.tsx");
    expect(source).not.toMatch(/from\(COVER_BUCKET\)\s*\.remove/);
    expect(source.indexOf("backupCsv(")).toBeGreaterThan(-1);
    expect(source.indexOf("backupCsv(")).toBeLessThan(source.indexOf(".upload("));
    expect(source).toContain("preparedBatchKey === batchKey && backupConfirmed");
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/i);
    // After changing covers the public pages are refreshed straight away.
    expect(source).toContain("refreshPublicPages()");
  });
  it("new cover uploads from the resource form use a one-year cache and the cropper caps at 800px", () => {
    expect(read("src/app/admin/page.tsx")).toContain('upload(path, file, { upsert: false, cacheControl: COVER_CACHE_CONTROL })');
    expect(read("src/app/admin/AdminResourcePreviewsField.tsx")).toContain("cacheControl: COVER_CACHE_CONTROL");
    expect(read("src/lib/resourceCoverCrop.ts")).toContain("RESOURCE_COVER_MAX_WIDTH = 800");
    expect(read("src/lib/resourceCoverCrop.ts")).toContain("RESOURCE_COVER_WEBP_QUALITY = 0.8");
  });
});
