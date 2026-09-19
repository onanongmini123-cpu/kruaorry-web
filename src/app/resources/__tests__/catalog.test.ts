import { describe, expect, it } from "vitest";
import { signupHref, toPublicResource } from "../catalog";
import { safeAuthNext } from "@/lib/authReturnPath";

const id = "11111111-2222-4333-8444-555555555555";
const base = {
  id,
  status: "published",
  title: "ใบงานคณิตศาสตร์ ป.4",
  meta: "ใบงานพร้อมเฉลย",
  description: "ดูรายละเอียดก่อนดาวน์โหลด",
  category: "คณิตศาสตร์",
  delivery_mode: "file_download",
  cta_url: null,
  file_path: `${id}/worksheet.pdf`,
  cover_image_url: "https://images.example.org/worksheet.png",
  tags: ["ป.4", "ใบงาน"],
  is_free: true,
  file_name: "worksheet.pdf",
};

describe("public resource showcase", () => {
  it("shows a genuine published free file and sends signup back to its download route", () => {
    const item = toPublicResource(base);
    expect(item?.title).toBe(base.title);
    expect(item?.isFree).toBe(true);
    expect(signupHref(item!)).toBe(`/login?next=${encodeURIComponent(`/download/${id}`)}&mode=signup`);
    expect(safeAuthNext(new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next"))).toBe(`/download/${id}`);
  });

  it("supports a real same-origin web app and routes signup back to its app detail", () => {
    const item = toPublicResource({ ...base, delivery_mode: "web_app", file_path: null, cta_url: "/tools/timer", is_free: false });
    expect(item).not.toBeNull();
    expect(signupHref(item!)).toBe(`/login?next=${encodeURIComponent(`/app?resource=${id}`)}&mode=signup`);
    expect(safeAuthNext(new URL(signupHref(item!), "https://kruaorry.example").searchParams.get("next"))).toBe(`/app?resource=${id}`);
  });

  it("never puts private destinations into the public page model", () => {
    const item = toPublicResource({ ...base, delivery_mode: "google_template", cta_url: "https://private.example/?token=SECRET", file_path: "private/path" });
    expect(JSON.stringify(item)).not.toMatch(/SECRET|private\/path|worksheet[.]pdf/);
  });

  it("fails closed for drafts, missing cover and invalid ids", () => {
    expect(toPublicResource({ ...base, status: "draft" })).toBeNull();
    expect(toPublicResource({ ...base, cover_image_url: null })).toBeNull();
    expect(toPublicResource({ ...base, id: "../admin" })).toBeNull();
  });
});
