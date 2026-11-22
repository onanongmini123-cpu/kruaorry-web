// The watermark is burned into the picture BEFORE it is uploaded, so the public
// file never exists without it. Used only by the admin console (browser).

export const WATERMARK_TEXT = "KruAorry.com – ตัวอย่าง";
export const PREVIEW_MAX_SIDE = 1280;

export interface WatermarkLayout {
  width: number;
  height: number;
  fontSize: number;
  angleRadians: number;
  /** Centres of the repeated text, in the rotated coordinate system around the image centre. */
  tiles: { x: number; y: number }[];
}

/** Scales the picture so its longest side is at most PREVIEW_MAX_SIDE. */
export function previewSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, PREVIEW_MAX_SIDE / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A diagonal grid of the text covering the WHOLE picture (including corners),
 * so cropping any part still leaves watermark behind.
 */
export function watermarkLayout(width: number, height: number): WatermarkLayout {
  const fontSize = Math.max(16, Math.round(Math.min(width, height) / 12));
  const stepX = fontSize * 11;
  const stepY = fontSize * 4;
  const reach = Math.ceil(Math.hypot(width, height) / 2) + stepX;
  const tiles: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = -reach; y <= reach; y += stepY, row += 1) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -reach; x <= reach; x += stepX) tiles.push({ x: x + offset, y });
  }
  return { width, height, fontSize, angleRadians: -Math.PI / 6, tiles };
}

/** Draws the watermark on a 2D context (browser canvas). */
export function drawWatermark(context: CanvasRenderingContext2D, width: number, height: number): void {
  const layout = watermarkLayout(width, height);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(layout.angleRadians);
  context.font = `700 ${layout.fontSize}px "IBM Plex Sans Thai", "Noto Sans Thai", system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, layout.fontSize / 8);
  for (const tile of layout.tiles) {
    context.strokeStyle = "rgba(0, 0, 0, 0.45)";
    context.strokeText(WATERMARK_TEXT, tile.x, tile.y);
    context.fillStyle = "rgba(255, 255, 255, 0.62)";
    context.fillText(WATERMARK_TEXT, tile.x, tile.y);
  }
  context.restore();
}

/** Decodes an image file, scales it down, burns the watermark in and returns a WebP (JPEG fallback) blob. */
export async function watermarkImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์ที่เลือกไม่ใช่รูปภาพ");
  const bitmap = await createImageBitmap(file);
  try {
    const size = previewSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์นี้สร้างรูปตัวอย่างไม่ได้");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    drawWatermark(context, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (blob && blob.type === "image/webp") return blob;
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!jpeg) throw new Error("สร้างไฟล์รูปตัวอย่างไม่สำเร็จ");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
