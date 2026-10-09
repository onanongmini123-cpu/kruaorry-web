import { describe, expect, it, vi } from "vitest";
import {
  cropAndOptimizeResourceCover,
  DEFAULT_RESOURCE_COVER_CROP,
  isResourceCoverAspect,
  panResourceCoverCrop,
  RESOURCE_COVER_WEBP_QUALITY,
  resourceCoverCropRect,
  resourceCoverFileName,
  resourceCoverOutputSize,
  resourceCoverPreviewRect,
} from "../resourceCoverCrop";

describe("resource cover crop", () => {
  it("uses the largest centered 4:3 frame at minimum zoom for wide and portrait images", () => {
    const wide = resourceCoverCropRect(2000, 1000, DEFAULT_RESOURCE_COVER_CROP);
    expect(wide.x).toBeCloseTo(1000 / 3);
    expect(wide.y).toBeCloseTo(0);
    expect(wide.width).toBeCloseTo(4000 / 3);
    expect(wide.height).toBeCloseTo(1000);
    expect(resourceCoverCropRect(800, 1600, { zoom: -5, positionX: 5, positionY: -5 })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it("keeps zoomed crops and pointer panning inside the source", () => {
    const moved = panResourceCoverCrop(
      { zoom: 2, positionX: 0, positionY: 0 },
      120,
      -80,
      400,
      300,
      1600,
      900,
    );
    const clamped = panResourceCoverCrop(moved, -100_000, 100_000, 400, 300, 1600, 900);
    const rect = resourceCoverCropRect(1600, 900, clamped);

    expect(moved.positionX).toBeLessThan(0);
    expect(moved.positionY).toBeGreaterThan(0);
    expect(clamped).toMatchObject({ positionX: 1, positionY: -1 });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1600);
    expect(rect.y + rect.height).toBeLessThanOrEqual(900);
  });

  it("derives the centered 16:10 card crop from the 4:3 cover", () => {
    expect(resourceCoverPreviewRect({ x: 0, y: 0, width: 1200, height: 900 }, 16 / 10)).toEqual({
      x: 0,
      y: 75,
      width: 1200,
      height: 750,
    });
  });

  it("never upscales tiny sources and caps large output at 1448 by 1086", () => {
    expect(resourceCoverOutputSize(4000, 3000, DEFAULT_RESOURCE_COVER_CROP)).toEqual({ width: 1448, height: 1086 });
    expect(resourceCoverOutputSize(320, 240, DEFAULT_RESOURCE_COVER_CROP)).toEqual({ width: 320, height: 240 });
    expect(resourceCoverOutputSize(80, 160, DEFAULT_RESOURCE_COVER_CROP)).toEqual({ width: 80, height: 60 });
  });

  it("recognizes a 4:3 source within the two-percent tolerance", () => {
    expect(isResourceCoverAspect(1448, 1086)).toBe(true);
    expect(isResourceCoverAspect(132, 100)).toBe(true);
    expect(isResourceCoverAspect(130, 100)).toBe(false);
    expect(isResourceCoverAspect(0, 100)).toBe(false);
  });

  it("renders a bounded WebP at quality 0.85", async () => {
    const bitmap = { width: 2400, height: 1600, close: vi.fn() };
    const drawImage = vi.fn();
    const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((resolve: (blob: Blob) => void, type: string, quality: number) => {
        expect(type).toBe("image/webp");
        expect(quality).toBe(RESOURCE_COVER_WEBP_QUALITY);
        resolve(new Blob(["optimized"], { type }));
      }),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) });

    try {
      const result = await cropAndOptimizeResourceCover({ type: "image/png", size: 4000 } as File);
      expect(result).toMatchObject({ extension: "webp", width: 1448, height: 1086 });
      const draw = drawImage.mock.calls[0];
      expect(draw[0]).toBe(bitmap);
      expect(draw[1]).toBeCloseTo(400 / 3);
      expect(draw[2]).toBeCloseTo(0);
      expect(draw[3]).toBeCloseTo(6400 / 3);
      expect(draw[4]).toBeCloseTo(1600);
      expect(draw.slice(5)).toEqual([0, 0, 1448, 1086]);
      expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.imageSmoothingQuality).toBe("high");
      expect(bitmap.close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to JPEG only when WebP encoding is unavailable", async () => {
    const bitmap = { width: 320, height: 240, close: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toBlob: vi.fn((resolve: (blob: Blob | null) => void, type: string) => {
        resolve(type === "image/webp" ? null : new Blob(["jpeg"], { type }));
      }),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) });

    try {
      await expect(cropAndOptimizeResourceCover({ type: "image/jpeg", size: 100 } as File))
        .resolves.toMatchObject({ extension: "jpg", width: 320, height: 240 });
      expect(canvas.toBlob).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates a safe filename for the optimized file", () => {
    const name = resourceCoverFileName("ปก สื่อ.PNG", "webp");
    expect(name).toMatch(/^[_.-]+-cropped\.webp$/);
    expect(name).not.toContain(" ");
  });
});
