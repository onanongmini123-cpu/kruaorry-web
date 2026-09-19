import { describe, expect, it } from "vitest";
import { isUsableResourceTarget, publicCoverUrl } from "../resourceVisibility";

describe("publicCoverUrl", () => {
  it("accepts a real HTTPS cover and rejects missing or fixture covers on both public surfaces", () => {
    expect(publicCoverUrl("https://cdn.school.example/cover.png")).toBe("https://cdn.school.example/cover.png");
    expect(publicCoverUrl(null)).toBeNull();
    expect(publicCoverUrl("https://example.com/placeholder.png")).toBeNull();
    expect(publicCoverUrl("http://localhost:3000/cover.png")).toBeNull();
  });
});

describe("isUsableResourceTarget", () => {
  it("accepts a real download path and a real external template", () => {
    expect(isUsableResourceTarget({ deliveryMode: "file_download", filePath: "worksheets/fractions.pdf", ctaUrl: null })).toBe(true);
    expect(isUsableResourceTarget({ deliveryMode: "google_template", filePath: null, ctaUrl: "https://docs.google.com/document/d/real-id/copy" })).toBe(true);
  });

  it("rejects starter seed placeholders and missing targets", () => {
    expect(isUsableResourceTarget({ deliveryMode: "google_template", filePath: null, ctaUrl: "https://docs.google.com/document/d/placeholder/copy" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "https://example.com/classroom-timer" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "google_form", filePath: null, ctaUrl: "https://forms.gle/placeholder" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "file_download", filePath: null, ctaUrl: null })).toBe(false);
  });

  it("rejects unsafe protocols and hostnames", () => {
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "javascript:alert(1)" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "//example.com" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "http://localhost:3000/tool" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "http://127.0.0.1:3000/tool" })).toBe(false);
    expect(isUsableResourceTarget({ deliveryMode: "web_app", filePath: null, ctaUrl: "/classroom/timer" })).toBe(true);
  });
});
