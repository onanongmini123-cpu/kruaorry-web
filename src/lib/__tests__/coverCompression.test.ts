import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminCoverCompressPanel, setCover } from "@/app/admin/AdminCoverCompressPanel";
import {
  backupCsv, COMPRESS_THRESHOLD_BYTES, COVER_CACHE_CONTROL, coverObjectPath, estimateAfterBytes, isCompressedCoverUrl, newCompressedPath,
  parseBackupCsv, planCompression, sameExceptCover, saveParamsWithCover, totals, type ResourceSnapshot,
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

const snapshot = (over: Partial<ResourceSnapshot> = {}): ResourceSnapshot => ({
  title: "สื่อ", meta: "m", description: null, category: null, grade_levels: ["p1", "p2"], delivery_mode: "web_app", cta_url: "https://x.example/play",
  cover_image_url: `${BASE}old.png`, file_path: null, file_name: null, file_size: null, file_mime_type: null, access_mode: "plans", plan_ids: ["teacher", "founder"], ...over,
});

describe("saving only the cover", () => {
  it("sends exactly what the resource form sends, with only the cover replaced", () => {
    const params = saveParamsWithCover(ID, snapshot(), `${BASE}v2/n.webp`);
    expect(params).toMatchObject({ p_resource_id: ID, p_create: false, p_title: "สื่อ", p_cta_url: "https://x.example/play", p_cover_image_url: `${BASE}v2/n.webp`, p_access_mode: "plans", p_plan_ids: ["teacher", "founder"] });
    expect(saveParamsWithCover(ID, snapshot({ access_mode: "public" }), "x").p_plan_ids).toEqual([]);
    expect("p_slug" in params).toBe(false);
  });
  it("sameExceptCover ignores the cover, blank-vs-null and order, but nothing else", () => {
    expect(sameExceptCover(snapshot(), snapshot({ cover_image_url: "z", description: "", plan_ids: ["founder", "teacher"], title: " สื่อ " }))).toBe(true);
    for (const patch of [{ title: "อื่น" }, { cta_url: "https://x.example/other" }, { access_mode: "public" }, { plan_ids: ["teacher"] }, { grade_levels: ["p1"] }, { file_size: 5 }]) {
      expect(sameExceptCover(snapshot(), snapshot(patch)), JSON.stringify(patch)).toBe(false);
    }
  });

  // A tiny fake of the database: one resource, the save RPC and the reads the tool makes.
  function fakeClient(opts: { corrupt?: boolean; rpcError?: string }) {
    const state = { ...snapshot(), plan_ids: ["teacher", "founder"] };
    const calls: Record<string, unknown>[] = [];
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: () => table === "resources"
            ? { single: async () => ({ data: { ...state }, error: null }) }
            : Promise.resolve({ data: state.plan_ids.map((plan_id) => ({ plan_id })), error: null }),
        }),
      }),
      rpc: (name: string, args?: Record<string, unknown>) => {
        if (name === "resolve_resource_target") return { maybeSingle: async () => ({ data: { delivery_mode: state.delivery_mode, cta_url: state.cta_url, file_path: state.file_path, file_name: state.file_name }, error: null }) };
        calls.push(args ?? {});
        if (opts.rpcError) return Promise.resolve({ error: { message: opts.rpcError } });
        state.cover_image_url = String(args?.p_cover_image_url ?? "");
        if (opts.corrupt && calls.length === 1) state.title = "ถูกเปลี่ยน";
        else state.title = String(args?.p_title);
        return Promise.resolve({ error: null });
      },
    };
    return { client: client as unknown as SupabaseClient, calls, state };
  }

  it("succeeds when nothing else changed and returns the previous cover for the backup", async () => {
    const { client, calls, state } = fakeClient({});
    await expect(setCover(client, ID, `${BASE}v2/n.webp`)).resolves.toEqual({ ok: true, previous: `${BASE}old.png` });
    expect(calls).toHaveLength(1);
    expect(state.cover_image_url).toBe(`${BASE}v2/n.webp`);
  });
  it("puts the first copy back and reports failure when anything else differs afterwards", async () => {
    const { client, calls, state } = fakeClient({ corrupt: true });
    const result = await setCover(client, ID, `${BASE}v2/n.webp`);
    expect(result).toMatchObject({ ok: false });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ p_title: "สื่อ", p_cover_image_url: `${BASE}old.png` });
    expect(state.title).toBe("สื่อ");
  });
  it("reports a save error without a second write", async () => {
    const { client, calls } = fakeClient({ rpcError: "denied" });
    await expect(setCover(client, ID, "x")).resolves.toEqual({ ok: false, reason: "บันทึกไม่สำเร็จ: denied" });
    expect(calls).toHaveLength(1);
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
  it("the tool never deletes files and backs up before the first upload", () => {
    const source = read("src/app/admin/AdminCoverCompressPanel.tsx");
    expect(source).not.toMatch(/from\(COVER_BUCKET\)\s*\.remove/);
    expect(source.indexOf("backupCsv(")).toBeGreaterThan(-1);
    expect(source.indexOf("backupCsv(")).toBeLessThan(source.indexOf(".upload("));
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/i);
    // After changing covers the public pages are refreshed straight away.
    expect(source).toContain("refreshPublicPages()");
  });
  it("new cover uploads from the resource form use a one-year cache and the cropper caps at 800px", () => {
    expect(read("src/app/admin/page.tsx")).toContain('upload(path, file, { upsert: false, cacheControl: COVER_CACHE_CONTROL })');
    expect(read("src/lib/resourceCoverCrop.ts")).toContain("RESOURCE_COVER_MAX_WIDTH = 800");
    expect(read("src/lib/resourceCoverCrop.ts")).toContain("RESOURCE_COVER_WEBP_QUALITY = 0.8");
  });
});
