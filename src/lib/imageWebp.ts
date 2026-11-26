// Shrinks a picture and saves it as WebP in the browser BEFORE it is uploaded, so
// storage and download quota are not spent on camera-sized originals.
// Browser only (canvas). `fitSize` is pure and unit-tested.

export function fitSize(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxWidth / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function compressToWebp(file: File, maxWidth: number, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์นี้ไม่ใช่รูปภาพ");
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxWidth);
    if (width === 0) throw new Error("อ่านรูปไม่ได้");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("เบราว์เซอร์นี้บันทึกเป็น WebP ไม่ได้ ลองใช้ Chrome หรือ Safari รุ่นใหม่");
    return blob;
  } finally {
    bitmap.close();
  }
}

export interface CompressedImage {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
}

/**
 * WebP when the browser really produced WebP; otherwise JPEG. iPhone/iPad (WebKit) silently
 * return a PNG from canvas.toBlob("image/webp"), so the type must be checked, not trusted.
 */
export function pickCompressedFormat(webp: Blob | null, jpeg: Blob | null): CompressedImage | null {
  if (webp && webp.type === "image/webp" && webp.size > 0) return { blob: webp, contentType: "image/webp", extension: "webp" };
  if (jpeg && jpeg.type === "image/jpeg" && jpeg.size > 0) return { blob: jpeg, contentType: "image/jpeg", extension: "jpg" };
  return null;
}

/** Same shrinking as compressToWebp, but falls back to JPEG where WebP cannot be encoded (iPhone/iPad). */
export async function compressImageForUpload(file: File, maxWidth: number, quality = 0.82, jpegQuality = 0.85): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์นี้ไม่ใช่รูปภาพ");
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxWidth);
    if (width === 0) throw new Error("อ่านรูปไม่ได้");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
    context.drawImage(bitmap, 0, 0, width, height);
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
    const webp = await toBlob("image/webp", quality);
    const jpeg = webp && webp.type === "image/webp" && webp.size > 0 ? null : await toBlob("image/jpeg", jpegQuality);
    const picked = pickCompressedFormat(webp, jpeg);
    if (!picked) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้ ลองใช้ Chrome บนคอมพิวเตอร์");
    return picked;
  } finally {
    bitmap.close();
  }
}
