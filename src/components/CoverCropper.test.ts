import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cropper = readFileSync(new URL("./CoverCropper.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

describe("admin cover cropper interaction contract", () => {
  it("is an inline drawer panel whose Escape handler cannot close the parent drawer", () => {
    expect(cropper).toContain('className="kru-cover-cropper"');
    expect(cropper).not.toContain('role="dialog"');
    expect(cropper).not.toContain('aria-modal="true"');
    expect(cropper).toContain('event.key !== "Escape"');
    expect(cropper).toContain("event.preventDefault()");
    expect(cropper).toContain("event.stopPropagation()");
    expect(cropper).toContain("onCancel();");
  });

  it("supports drag, keyboard arrows, zoom, reset and 44px touch targets", () => {
    expect(cropper).toContain("onPointerMove={drag}");
    expect(cropper).toContain("ArrowLeft");
    expect(cropper).toContain("ArrowRight");
    expect(cropper).toContain("ArrowUp");
    expect(cropper).toContain("ArrowDown");
    expect(cropper).toContain('type="range"');
    expect(cropper).toContain("รีเซ็ต");
    expect(cropper).toMatch(/min-height: 44px/g);
  });

  it("shows both 16:10 and 4:3 previews and explains the wider card trim", () => {
    expect(cropper).toContain("การ์ดในคลังสื่อ");
    expect(cropper).toContain("หน้ารายละเอียด/หน้าแรก");
    expect(cropper).toContain("resourceCoverPreviewRect");
    expect(cropper).toContain("kru-cover-cropper__card-safe");
    expect(cropper).toContain("เส้นประสีชมพู");
  });

  it("replaces the pending upload only after confirming an optimized crop", () => {
    expect(page).toContain("setCoverCropSource(file)");
    expect(page).toContain("setSelectedCoverFile(croppedFile)");
    expect(page).toContain("setCoverCropMeta(output)");
    expect(page).toContain("coverInputRef.current?.focus()");
    expect(page).toContain("Boolean(coverCropSource)");
    expect(page).toContain('aspectRatio: "4 / 3"');
    expect(page.indexOf("setCoverCropSource(file)")).toBeLessThan(page.indexOf("setSelectedCoverFile(croppedFile)"));
  });
});
