import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, jsonLdScript, resourceJsonLd, resourceSeoDescription, resourceSeoTitle } from "../resourceSeo";

const base = {
  title: "Sentence Train",
  category: "ภาษาอังกฤษ",
  description: "เกมเรียงประโยค ฝึกโครงสร้างประโยคภาษาอังกฤษผ่านภารกิจรถไฟ",
  meta: "เว็บเกมภาษาอังกฤษ · 810 ประโยค",
  gradeLevels: ["p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3"],
  deliveryMode: "web_app" as const,
  coverImageUrl: "https://images.example.org/train.png",
  accessMode: "public" as const,
};

describe("resourceSeoTitle", () => {
  it("is name · subject · grade when it fits", () => {
    expect(resourceSeoTitle(base)).toBe("Sentence Train · ภาษาอังกฤษ · ป.2–ม.3");
  });

  it("drops the grade, then the subject, instead of stuffing keywords", () => {
    const long = { ...base, title: "Grammar Boss Battle — ศึกบอสไวยากรณ์ ฉบับพิเศษมาก ๆ" };
    expect(resourceSeoTitle(long).length).toBeLessThanOrEqual(56);
    expect(resourceSeoTitle({ ...long, title: "ก".repeat(70) })).toBe("ก".repeat(70));
    expect(resourceSeoTitle({ ...base, category: "", gradeLevels: [] })).toBe("Sentence Train");
  });
});

describe("resourceSeoDescription", () => {
  it("uses a one-line excerpt of the description, never the whole text", () => {
    expect(resourceSeoDescription(base)).toBe(base.description);
    const long = resourceSeoDescription({ ...base, description: "ข้อความยาว ".repeat(100) });
    expect(long.length).toBeLessThanOrEqual(156);
    expect(long.endsWith("…")).toBe(true);
  });

  it("falls back to a factual line when a resource has no text", () => {
    expect(resourceSeoDescription({ ...base, description: "", meta: "" })).toBe("เกมและสื่อออนไลน์ · ภาษาอังกฤษ · ป.2–ม.3 สำหรับครูไทย บน KruAorry");
  });
});

describe("structured data", () => {
  it("describes only facts the page shows and marks free access truthfully", () => {
    const free = resourceJsonLd(base, "/resources/sentence-train");
    expect(free).toMatchObject({
      "@type": "LearningResource",
      name: "Sentence Train",
      url: "https://kruaorry.com/resources/sentence-train",
      inLanguage: "th",
      educationalLevel: "ป.2–ม.3",
      isAccessibleForFree: true,
    });
    expect(resourceJsonLd({ ...base, accessMode: "plans" }, "/resources/x")).toMatchObject({ isAccessibleForFree: false });
    expect(JSON.stringify(free)).not.toMatch(/aggregateRating|review/i);
  });

  it("builds a breadcrumb that ends on the canonical page", () => {
    const crumb = breadcrumbJsonLd("Sentence Train", "/resources/sentence-train") as { itemListElement: { item: string }[] };
    expect(crumb.itemListElement.at(-1)?.item).toBe("https://kruaorry.com/resources/sentence-train");
  });

  it("cannot be used to close the script tag", () => {
    const script = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>");
    expect(JSON.parse(script).name).toBe("</script><script>alert(1)</script>");
  });
});
