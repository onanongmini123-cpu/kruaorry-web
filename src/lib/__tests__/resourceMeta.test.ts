import { describe, expect, it } from "vitest";
import { DELIVERY_TYPE_LABEL, parseResourceMeta, resourceTypeOf, shortDescription } from "../resourceMeta";

describe("parseResourceMeta", () => {
  it("pulls countable facts and play modes, and drops grade text", () => {
    expect(parseResourceMeta("เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · เดี่ยว/2 คน/2–4 ทีม · ป.2–ม.3")).toEqual({
      metrics: ["810 ประโยค", "6 โครงสร้าง"],
      playModes: "เดี่ยว/2 คน/2–4 ทีม",
    });
    expect(parseResourceMeta("เว็บเกมทีม · 120 ข้อ · คณิตศาสตร์และอังกฤษ · 3 ระดับ · 2–4 ทีม · ป.1–6")).toEqual({
      metrics: ["120 ข้อ", "3 ระดับ"],
      playModes: "2–4 ทีม",
    });
  });

  it("never returns grade segments, even ones without a number", () => {
    const parsed = parseResourceMeta("เว็บเกม · อนุบาล–ป.3 · 78 คำ A–Z · ป.1–ป.6");
    expect(parsed.metrics).toEqual(["78 คำ A–Z"]);
    expect(JSON.stringify(parsed)).not.toMatch(/ป\.|อนุบาล/);
  });

  it("is safe on empty and unstructured input", () => {
    expect(parseResourceMeta(null)).toEqual({ metrics: [], playModes: null });
    expect(parseResourceMeta("")).toEqual({ metrics: [], playModes: null });
    expect(parseResourceMeta("ใบงานพร้อมเฉลย")).toEqual({ metrics: [], playModes: null });
  });
});

describe("shortDescription", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(shortDescription("  สั้น ๆ\n  พอดี  ")).toBe("สั้น ๆ พอดี");
    expect(shortDescription(null)).toBe("");
  });

  it("cuts long Thai text under the limit with an ellipsis and no broken marks", () => {
    const long = "เกมภารกิจกู้ระเบิดคำศัพท์สำหรับผู้เรียนระดับประถม ฝึกคำศัพท์ภาษาอังกฤษ 48 คำใน 4 หมวด ได้แก่ สัตว์ ของใช้ในห้องเรียน อาหาร และส่วนต่าง ๆ ของร่างกาย ผ่านภารกิจปลดล็อก 8 ขั้น เลือกได้ 3 ระดับ";
    const short = shortDescription(long, 100);
    expect(short.length).toBeLessThanOrEqual(101);
    expect(short.endsWith("…")).toBe(true);
    expect(short.slice(0, -1).trimEnd()).toBe(long.slice(0, short.length - 1).trimEnd());
    // never ends right after a leading vowel/tone mark that needs its base letter
    expect(short.slice(-2, -1)).not.toMatch(/[เแโใไ]/);
  });
});

describe("resource type labels", () => {
  it("maps every delivery mode to a customer label and filter value", () => {
    expect(DELIVERY_TYPE_LABEL.web_app).toBe("เกมและสื่อออนไลน์");
    expect(resourceTypeOf("web_app")).toBe("online");
    expect(resourceTypeOf("google_template")).toBe("template");
    expect(resourceTypeOf("google_form")).toBe("form");
    expect(resourceTypeOf("file_download")).toBe("file");
  });
});
