export const RESOURCE_COVER_ASPECT = 4 / 3;
export const RESOURCE_CARD_ASPECT = 16 / 10;
export const RESOURCE_COVER_MAX_WIDTH = 1448;
export const RESOURCE_COVER_MIN_ZOOM = 1;
export const RESOURCE_COVER_MAX_ZOOM = 4;
export const RESOURCE_COVER_WEBP_QUALITY = 0.85;
export const RESOURCE_COVER_JPEG_QUALITY = 0.88;

export type ResourceCoverCrop = {
  zoom: number;
  positionX: number;
  positionY: number;
};

export type ResourceCoverRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResourceCoverOutput = {
  blob: Blob;
  extension: "webp" | "jpg";
  width: number;
  height: number;
};

export const DEFAULT_RESOURCE_COVER_CROP: ResourceCoverCrop = {
  zoom: RESOURCE_COVER_MIN_ZOOM,
  positionX: 0,
  positionY: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeResourceCoverCrop(crop: ResourceCoverCrop): ResourceCoverCrop {
  return {
    zoom: clamp(
      Number.isFinite(crop.zoom) ? crop.zoom : RESOURCE_COVER_MIN_ZOOM,
      RESOURCE_COVER_MIN_ZOOM,
      RESOURCE_COVER_MAX_ZOOM,
    ),
    positionX: clamp(Number.isFinite(crop.positionX) ? crop.positionX : 0, -1, 1),
    positionY: clamp(Number.isFinite(crop.positionY) ? crop.positionY : 0, -1, 1),
  };
}

/** Largest bounded 4:3 crop at zoom 1; zoom and pan always stay inside the source image. */
export function resourceCoverCropRect(
  imageWidth: number,
  imageHeight: number,
  crop: ResourceCoverCrop,
): ResourceCoverRect {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("ขนาดภาพไม่ถูกต้อง");
  }

  const normalized = normalizeResourceCoverCrop(crop);
  const sourceAspect = imageWidth / imageHeight;
  const baseWidth = sourceAspect >= RESOURCE_COVER_ASPECT
    ? imageHeight * RESOURCE_COVER_ASPECT
    : imageWidth;
  const baseHeight = baseWidth / RESOURCE_COVER_ASPECT;
  const width = baseWidth / normalized.zoom;
  const height = baseHeight / normalized.zoom;
  const centeredX = (imageWidth - width) / 2;
  const centeredY = (imageHeight - height) / 2;

  return {
    x: clamp(centeredX + normalized.positionX * centeredX, 0, imageWidth - width),
    y: clamp(centeredY + normalized.positionY * centeredY, 0, imageHeight - height),
    width,
    height,
  };
}

/** Converts a pointer drag over the 4:3 workspace into a bounded source-image pan. */
export function panResourceCoverCrop(
  crop: ResourceCoverCrop,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
): ResourceCoverCrop {
  const normalized = normalizeResourceCoverCrop(crop);
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
    return normalized;
  }

  const rect = resourceCoverCropRect(imageWidth, imageHeight, normalized);
  const maxX = (imageWidth - rect.width) / 2;
  const maxY = (imageHeight - rect.height) / 2;
  return {
    ...normalized,
    positionX: maxX > 0
      ? clamp(normalized.positionX - ((deltaX * rect.width) / viewportWidth) / maxX, -1, 1)
      : 0,
    positionY: maxY > 0
      ? clamp(normalized.positionY - ((deltaY * rect.height) / viewportHeight) / maxY, -1, 1)
      : 0,
  };
}

/** Center-crops an already bounded cover rect for a wider preview such as the 16:10 library card. */
export function resourceCoverPreviewRect(rect: ResourceCoverRect, targetAspect: number): ResourceCoverRect {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0) throw new Error("สัดส่วนตัวอย่างไม่ถูกต้อง");
  const sourceAspect = rect.width / rect.height;
  if (Math.abs(sourceAspect - targetAspect) < Number.EPSILON) return { ...rect };
  if (sourceAspect > targetAspect) {
    const width = rect.height * targetAspect;
    return { x: rect.x + (rect.width - width) / 2, y: rect.y, width, height: rect.height };
  }
  const height = rect.width / targetAspect;
  return { x: rect.x, y: rect.y + (rect.height - height) / 2, width: rect.width, height };
}

export function resourceCoverOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  crop: ResourceCoverCrop,
  maxWidth = RESOURCE_COVER_MAX_WIDTH,
): { width: number; height: number } {
  const rect = resourceCoverCropRect(sourceWidth, sourceHeight, crop);
  const boundedMax = Number.isFinite(maxWidth) && maxWidth > 0 ? Math.floor(maxWidth) : RESOURCE_COVER_MAX_WIDTH;
  const availableWidth = Math.max(1, Math.floor(Math.min(boundedMax, rect.width)));
  // Multiples of four keep a pixel-perfect 4:3 result when the source is large enough.
  const width = availableWidth >= 4 ? availableWidth - (availableWidth % 4) : availableWidth;
  const height = Math.max(1, Math.min(Math.floor(rect.height), Math.round(width / RESOURCE_COVER_ASPECT)));
  return { width, height };
}

export function isResourceCoverAspect(width: number, height: number, tolerance = 0.02): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  return Math.abs((width / height) / RESOURCE_COVER_ASPECT - 1) <= tolerance;
}

async function loadCoverImage(file: File): Promise<{
  width: number;
  height: number;
  source: CanvasImageSource;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      bitmap.close();
      throw new Error("อ่านขนาดภาพไม่ได้");
    }
    return { width: bitmap.width, height: bitmap.height, source: bitmap, dispose: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | null = null;
  try {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error("อ่านขนาดภาพไม่ได้");
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    if (image) image.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function cropAndOptimizeResourceCover(
  file: File,
  crop: ResourceCoverCrop = DEFAULT_RESOURCE_COVER_CROP,
): Promise<ResourceCoverOutput> {
  if (!file.type.toLowerCase().startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  if (file.size <= 0) throw new Error("ไฟล์ภาพว่างเปล่า กรุณาเลือกไฟล์ใหม่");

  let image: Awaited<ReturnType<typeof loadCoverImage>>;
  try {
    image = await loadCoverImage(file);
  } catch {
    throw new Error("เปิดไฟล์ภาพไม่ได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ใหม่");
  }

  try {
    const rect = resourceCoverCropRect(image.width, image.height, crop);
    const output = resourceCoverOutputSize(image.width, image.height, crop);
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลภาพนี้ได้");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image.source,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      output.width,
      output.height,
    );

    const webp = await canvasBlob(canvas, "image/webp", RESOURCE_COVER_WEBP_QUALITY);
    if (webp?.type === "image/webp" && webp.size > 0) {
      return { blob: webp, extension: "webp", ...output };
    }
    const jpeg = await canvasBlob(canvas, "image/jpeg", RESOURCE_COVER_JPEG_QUALITY);
    if (!jpeg || jpeg.type !== "image/jpeg" || jpeg.size <= 0) {
      throw new Error("บีบอัดภาพไม่สำเร็จ กรุณาลองใช้ไฟล์ JPG หรือ PNG ใหม่");
    }
    return { blob: jpeg, extension: "jpg", ...output };
  } finally {
    image.dispose();
  }
}

export function resourceCoverFileName(originalName: string, extension: "webp" | "jpg"): string {
  const stem = originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "cover";
  return `${stem}-cropped.${extension}`;
}
