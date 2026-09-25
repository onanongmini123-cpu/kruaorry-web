import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PROFILE_AVATAR_SIGNED_URL_REFRESH_MS = (PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS - 60) * 1000;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_PATH_PATTERN = /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const AVATAR_OBJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CachedSignedUrl = { url: string; refreshAt: number };
const signedUrlCache = new WeakMap<SupabaseClient, Map<string, CachedSignedUrl>>();

export function validateAvatarFile(file: Pick<File, "size" | "type">): string | null {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) return "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP";
  if (file.size <= 0) return "ไฟล์ภาพว่างเปล่า";
  if (file.size > PROFILE_AVATAR_MAX_BYTES) return "ไฟล์ภาพต้องมีขนาดไม่เกิน 5 MB";
  return null;
}

export function isAvatarStoragePath(path: string): boolean {
  return AVATAR_PATH_PATTERN.test(path);
}

export function avatarStoragePath(objectId = crypto.randomUUID()): string {
  if (!AVATAR_OBJECT_ID_PATTERN.test(objectId)) {
    throw new Error("Invalid avatar object id");
  }
  return `avatars/${objectId.toLowerCase()}.webp`;
}

export async function avatarSignedUrl(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (!isAvatarStoragePath(path)) throw new Error("Invalid avatar path");

  const now = Date.now();
  const clientCache = signedUrlCache.get(supabase);
  const cached = clientCache?.get(path);
  if (cached && cached.refreshAt > now) return cached.url;

  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(path, PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("สร้างลิงก์รูปโปรไฟล์ไม่สำเร็จ");

  const nextCache = clientCache ?? new Map<string, CachedSignedUrl>();
  nextCache.set(path, { url: data.signedUrl, refreshAt: now + PROFILE_AVATAR_SIGNED_URL_REFRESH_MS });
  if (!clientCache) signedUrlCache.set(supabase, nextCache);
  return data.signedUrl;
}

export function clearAvatarSignedUrlCache(supabase: SupabaseClient, path?: string): void {
  const clientCache = signedUrlCache.get(supabase);
  if (!clientCache) return;
  if (path) clientCache.delete(path);
  else clientCache.clear();
}

async function loadImage(file: File): Promise<{ width: number; height: number; source: CanvasImageSource; dispose: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, dispose: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight, source: image, dispose: () => URL.revokeObjectURL(url) };
}

export async function cropAndOptimizeAvatar(file: File, outputSize = 512): Promise<Blob> {
  const validationError = validateAvatarFile(file);
  if (validationError) throw new Error(validationError);
  const image = await loadImage(file);
  try {
    const side = Math.min(image.width, image.height);
    const sourceX = Math.max(0, (image.width - side) / 2);
    const sourceY = Math.max(0, (image.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลภาพนี้ได้");
    context.drawImage(image.source, sourceX, sourceY, side, side, 0, 0, outputSize, outputSize);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("ปรับขนาดภาพไม่สำเร็จ");
    return blob;
  } finally {
    image.dispose();
  }
}
