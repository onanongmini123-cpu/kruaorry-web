import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_OUTPUT_SIZE = 512;
export const PROFILE_AVATAR_MIN_ZOOM = 1;
export const PROFILE_AVATAR_MAX_ZOOM = 3;
export const PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PROFILE_AVATAR_SIGNED_URL_REFRESH_MS = (PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS - 60) * 1000;
export const PROFILE_AVATAR_LOCAL_PREVIEW_MS = 8_000;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_PATH_PATTERN = /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const AVATAR_OBJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AvatarCrop = {
  zoom: number;
  positionX: number;
  positionY: number;
};

export type AvatarCropRect = {
  x: number;
  y: number;
  size: number;
};

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  zoom: PROFILE_AVATAR_MIN_ZOOM,
  positionX: 0,
  positionY: 0,
};

type CachedSignedUrl = {
  url: string;
  refreshAt: number;
  dispose?: () => void;
  expiryTimer?: ReturnType<typeof setTimeout>;
};
const signedUrlCache = new WeakMap<SupabaseClient, Map<string, CachedSignedUrl>>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function disposeCachedUrl(cached: CachedSignedUrl | undefined): void {
  if (!cached) return;
  if (cached.expiryTimer !== undefined) {
    clearTimeout(cached.expiryTimer);
    cached.expiryTimer = undefined;
  }
  const dispose = cached.dispose;
  cached.dispose = undefined;
  dispose?.();
}

function normalizedAvatarCrop(crop: AvatarCrop): AvatarCrop {
  return {
    zoom: clamp(Number.isFinite(crop.zoom) ? crop.zoom : PROFILE_AVATAR_MIN_ZOOM, PROFILE_AVATAR_MIN_ZOOM, PROFILE_AVATAR_MAX_ZOOM),
    positionX: clamp(Number.isFinite(crop.positionX) ? crop.positionX : 0, -1, 1),
    positionY: clamp(Number.isFinite(crop.positionY) ? crop.positionY : 0, -1, 1),
  };
}

export function validateAvatarFile(file: Pick<File, "size" | "type">): string | null {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type.toLowerCase())) return "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP";
  if (file.size <= 0) return "ไฟล์ภาพว่างเปล่า";
  if (file.size > PROFILE_AVATAR_MAX_BYTES) return "ไฟล์ภาพต้องมีขนาดไม่เกิน 5 MB";
  return null;
}

export function avatarCropRect(width: number, height: number, crop: AvatarCrop): AvatarCropRect {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("ขนาดภาพไม่ถูกต้อง");
  }

  const normalized = normalizedAvatarCrop(crop);
  const size = Math.min(width, height) / normalized.zoom;
  const centeredX = (width - size) / 2;
  const centeredY = (height - size) / 2;
  return {
    x: clamp(centeredX + normalized.positionX * centeredX, 0, width - size),
    y: clamp(centeredY + normalized.positionY * centeredY, 0, height - size),
    size,
  };
}

/** Converts a pointer drag over the square preview into a bounded source-image pan. */
export function panAvatarCrop(
  crop: AvatarCrop,
  deltaX: number,
  deltaY: number,
  viewportSize: number,
  imageWidth: number,
  imageHeight: number,
): AvatarCrop {
  const normalized = normalizedAvatarCrop(crop);
  if (!Number.isFinite(viewportSize) || viewportSize <= 0) return normalized;

  const rect = avatarCropRect(imageWidth, imageHeight, normalized);
  const maxX = (imageWidth - rect.size) / 2;
  const maxY = (imageHeight - rect.size) / 2;
  return {
    ...normalized,
    positionX: maxX > 0
      ? clamp(normalized.positionX - ((deltaX * rect.size) / viewportSize) / maxX, -1, 1)
      : 0,
    positionY: maxY > 0
      ? clamp(normalized.positionY - ((deltaY * rect.size) / viewportSize) / maxY, -1, 1)
      : 0,
  };
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
  if (cached) {
    disposeCachedUrl(cached);
    clientCache?.delete(path);
  }

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

export function cachedAvatarUrl(supabase: SupabaseClient, path: string): string | null {
  const cached = signedUrlCache.get(supabase)?.get(path);
  return cached && cached.refreshAt > Date.now() ? cached.url : null;
}

export function avatarUrlRefreshDelay(supabase: SupabaseClient, path: string): number {
  const cached = signedUrlCache.get(supabase)?.get(path);
  if (!cached) return PROFILE_AVATAR_SIGNED_URL_REFRESH_MS;
  return Math.max(0, cached.refreshAt - Date.now());
}

/**
 * Makes a freshly saved avatar visible across mounted ProfileAvatar instances
 * before the first signed-URL round trip. It is replaced with a signed URL a
 * few seconds later and its object URL is revoked automatically.
 */
export function primeAvatarPreview(supabase: SupabaseClient, path: string, blob: Blob): void {
  if (!isAvatarStoragePath(path) || typeof URL.createObjectURL !== "function") return;
  const clientCache = signedUrlCache.get(supabase) ?? new Map<string, CachedSignedUrl>();
  const previous = clientCache.get(path);
  disposeCachedUrl(previous);
  const url = URL.createObjectURL(blob);
  const preview: CachedSignedUrl = {
    url,
    refreshAt: Date.now() + PROFILE_AVATAR_LOCAL_PREVIEW_MS,
    dispose: () => URL.revokeObjectURL(url),
  };
  preview.expiryTimer = setTimeout(() => {
    const activeCache = signedUrlCache.get(supabase);
    if (activeCache?.get(path) !== preview) return;
    activeCache.delete(path);
    disposeCachedUrl(preview);
  }, PROFILE_AVATAR_LOCAL_PREVIEW_MS);
  clientCache.set(path, preview);
  if (!signedUrlCache.has(supabase)) signedUrlCache.set(supabase, clientCache);
}

export function clearAvatarSignedUrlCache(supabase: SupabaseClient, path?: string): void {
  const clientCache = signedUrlCache.get(supabase);
  if (!clientCache) return;
  if (path) {
    disposeCachedUrl(clientCache.get(path));
    clientCache.delete(path);
  } else {
    for (const cached of clientCache.values()) disposeCachedUrl(cached);
    clientCache.clear();
  }
}

/**
 * Updates exactly the authenticated caller's avatar column. The database RLS
 * and ownership trigger remain the authority; the explicit getUser check also
 * prevents the self-service UI from ever selecting an arbitrary profile id.
 */
export async function updateMyAvatar(supabase: SupabaseClient, avatarPath: string | null): Promise<string | null> {
  if (avatarPath && !isAvatarStoragePath(avatarPath)) return "ที่อยู่ไฟล์รูปโปรไฟล์ไม่ถูกต้อง";

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("id", authData.user.id)
    .select("avatar_path")
    .maybeSingle();
  if (error) return "บันทึกรูปโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง";
  if (!data || data.avatar_path !== avatarPath) return "ไม่พบบัญชีที่จะแก้ไข";
  return null;
}

async function loadImage(file: File): Promise<{ width: number; height: number; source: CanvasImageSource; dispose: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, dispose: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | null = null;
  try {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    try {
      if (image) image.src = "";
    } finally {
      URL.revokeObjectURL(url);
    }
    throw error;
  }
}

export async function cropAndOptimizeAvatar(
  file: File,
  crop: AvatarCrop = DEFAULT_AVATAR_CROP,
  outputSize = PROFILE_AVATAR_OUTPUT_SIZE,
): Promise<Blob> {
  const validationError = validateAvatarFile(file);
  if (validationError) throw new Error(validationError);
  if (!Number.isInteger(outputSize) || outputSize < 64 || outputSize > PROFILE_AVATAR_OUTPUT_SIZE) {
    throw new Error("ขนาดภาพปลายทางไม่ถูกต้อง");
  }
  const image = await loadImage(file);
  try {
    const rect = avatarCropRect(image.width, image.height, crop);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลภาพนี้ได้");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, rect.x, rect.y, rect.size, rect.size, 0, 0, outputSize, outputSize);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("ปรับขนาดภาพไม่สำเร็จ");
    if (blob.type !== "image/webp") throw new Error("เบราว์เซอร์นี้ยังไม่รองรับการบีบอัด WebP");
    return blob;
  } finally {
    image.dispose();
  }
}
