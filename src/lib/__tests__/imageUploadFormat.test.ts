import { describe, expect, it } from "vitest";
import { pickCompressedFormat } from "@/lib/imageWebp";

const blob = (type: string, size = 10) => new Blob([new Uint8Array(size)], { type });

describe("pickCompressedFormat (WebP, or JPEG on iPhone/iPad)", () => {
  it("uses WebP when the browser really made WebP", () => {
    const webp = blob("image/webp");
    expect(pickCompressedFormat(webp, blob("image/jpeg"))).toEqual({ blob: webp, contentType: "image/webp", extension: "webp" });
  });

  it("falls back to JPEG when 'WebP' came back as PNG (WebKit)", () => {
    const jpeg = blob("image/jpeg");
    expect(pickCompressedFormat(blob("image/png"), jpeg)).toEqual({ blob: jpeg, contentType: "image/jpeg", extension: "jpg" });
  });

  it("falls back to JPEG when WebP encoding returned nothing", () => {
    const jpeg = blob("image/jpeg");
    expect(pickCompressedFormat(null, jpeg)).toEqual({ blob: jpeg, contentType: "image/jpeg", extension: "jpg" });
  });

  it("returns null when neither format is usable (empty, odd type, or nothing)", () => {
    expect(pickCompressedFormat(blob("image/webp", 0), blob("image/jpeg", 0))).toBeNull();
    expect(pickCompressedFormat(blob("image/png"), blob("image/gif"))).toBeNull();
    expect(pickCompressedFormat(null, null)).toBeNull();
  });
});
