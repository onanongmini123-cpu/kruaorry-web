import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/asyncTimeout";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_OUTPUT_SIZE = 512;
export const PROFILE_AVATAR_MIN_ZOOM = 1;
export const PROFILE_AVATAR_MAX_ZOOM = 3;
export const PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PROFILE_AVATAR_SIGNED_URL_REFRESH_MS = (PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS - 60) * 1000;
export const PROFILE_AVATAR_LOCAL_PREVIEW_MS = 8_000;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_AVATAR_PATH_PATTERN = /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const DETERMINISTIC_AVATAR_PATH_PATTERN = /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/i;

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
const avatarCacheListeners = new WeakMap<SupabaseClient, Map<string, Set<() => void>>>();

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
  return LEGACY_AVATAR_PATH_PATTERN.test(path) || DETERMINISTIC_AVATAR_PATH_PATTERN.test(path);
}

export function isDeterministicAvatarStoragePath(path: string): boolean {
  return DETERMINISTIC_AVATAR_PATH_PATTERN.test(path);
}

function isLegacyAvatarStoragePath(path: string): boolean {
  return LEGACY_AVATAR_PATH_PATTERN.test(path);
}

export function avatarStoragePath(userId: string): string {
  if (!AVATAR_USER_ID_PATTERN.test(userId)) {
    throw new Error("Invalid avatar user id");
  }
  return `avatars/${userId.toLowerCase()}/avatar.webp`;
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
    .createSignedUrl(path, PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS, { cacheNonce: String(Math.trunc(now)) });
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
  for (const listener of avatarCacheListeners.get(supabase)?.get(path) ?? []) listener();
}

export function subscribeAvatarCache(supabase: SupabaseClient, path: string, listener: () => void): () => void {
  const clientListeners = avatarCacheListeners.get(supabase) ?? new Map<string, Set<() => void>>();
  const pathListeners = clientListeners.get(path) ?? new Set<() => void>();
  pathListeners.add(listener);
  clientListeners.set(path, pathListeners);
  if (!avatarCacheListeners.has(supabase)) avatarCacheListeners.set(supabase, clientListeners);

  return () => {
    pathListeners.delete(listener);
    if (pathListeners.size === 0) clientListeners.delete(path);
  };
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

type AuthenticatedAvatarUser = { userId: string; error: null } | { userId: null; error: string };

export type AvatarPersistenceResult = {
  avatarPath: string | null;
  error: string | null;
  cleanupWarning: string | null;
};

async function authenticatedAvatarUser(supabase: SupabaseClient): Promise<AuthenticatedAvatarUser> {
  const outcome = await withTimeout(Promise.resolve().then(() => supabase.auth.getUser()), "avatar session");
  if (!outcome.ok) return { userId: null, error: "ตรวจสอบเซสชันไม่สำเร็จ กรุณาลองอีกครั้ง" };
  const { data, error } = outcome.value;
  if (error || !data.user || data.user.is_anonymous === true) {
    return { userId: null, error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" };
  }
  if (!AVATAR_USER_ID_PATTERN.test(data.user.id)) {
    return { userId: null, error: "บัญชีผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง" };
  }
  return { userId: data.user.id.toLowerCase(), error: null };
}

async function writeMyAvatarPath(supabase: SupabaseClient, avatarPath: string | null): Promise<string | null> {
  const outcome = await withTimeout(Promise.resolve().then(() => supabase.rpc("update_my_avatar", {
    p_avatar_path: avatarPath,
  })), "avatar profile update");
  if (!outcome.ok || outcome.value.error) return "บันทึกรูปโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง";
  return null;
}

async function readMyAvatarPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; avatarPath: string | null } | { ok: false }> {
  const outcome = await withTimeout(Promise.resolve().then(() => supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle()), "avatar persistence check");
  if (!outcome.ok || outcome.value.error || !outcome.value.data) return { ok: false };
  return { ok: true, avatarPath: outcome.value.data.avatar_path };
}

async function removeAvatarObject(supabase: SupabaseClient, path: string): Promise<string | null> {
  if (!isAvatarStoragePath(path)) return "ที่อยู่ไฟล์รูปโปรไฟล์ไม่ถูกต้อง";
  try {
    const outcome = await withTimeout(Promise.resolve().then(
      () => supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]),
    ), "avatar object cleanup");
    if (!outcome.ok || outcome.value.error) return "ลบไฟล์รูปโปรไฟล์ไม่สำเร็จ";
    return null;
  } finally {
    clearAvatarSignedUrlCache(supabase, path);
  }
}

/** Updates only the authenticated caller through the self-targeting avatar RPC. */
export async function updateMyAvatar(supabase: SupabaseClient, avatarPath: string | null): Promise<string | null> {
  const auth = await authenticatedAvatarUser(supabase);
  if (!auth.userId) return auth.error;
  if (avatarPath !== null && avatarPath !== avatarStoragePath(auth.userId)) {
    return "ที่อยู่ไฟล์รูปโปรไฟล์ไม่ถูกต้อง";
  }
  return writeMyAvatarPath(supabase, avatarPath);
}

/**
 * Persists an already cropped WebP to the caller's one deterministic object.
 * If the RPC response is lost, a read-back resolves the outcome. On an
 * unconfirmed failure the fixed object is deliberately retained: deleting it
 * could erase a concurrent successful replacement, while retaining it cannot
 * grow storage beyond this one key and a retry safely overwrites it.
 */
export async function persistMyAvatarBlob(
  supabase: SupabaseClient,
  blob: Blob,
  previousPath: string | null,
): Promise<AvatarPersistenceResult> {
  if (blob.type !== "image/webp" || blob.size <= 0 || blob.size > PROFILE_AVATAR_MAX_BYTES) {
    return { avatarPath: previousPath, error: "ไฟล์รูปโปรไฟล์ที่เตรียมไว้ไม่ถูกต้อง", cleanupWarning: null };
  }

  const auth = await authenticatedAvatarUser(supabase);
  if (!auth.userId) return { avatarPath: previousPath, error: auth.error, cleanupWarning: null };
  const nextPath = avatarStoragePath(auth.userId);
  const upload = await withTimeout(Promise.resolve().then(() => supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(nextPath, blob, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "60",
    })), "avatar upload");
  if (!upload.ok || upload.value.error) {
    return { avatarPath: previousPath, error: "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง", cleanupWarning: null };
  }
  clearAvatarSignedUrlCache(supabase, nextPath);

  const writeError = await writeMyAvatarPath(supabase, nextPath);
  if (writeError) {
    const persisted = await readMyAvatarPath(supabase, auth.userId);
    if (!persisted.ok || persisted.avatarPath !== nextPath) {
      return { avatarPath: previousPath, error: writeError, cleanupWarning: null };
    }
  }

  let cleanupWarning: string | null = null;
  if (previousPath && previousPath !== nextPath) {
    const cleanupError = await removeAvatarObject(supabase, previousPath);
    if (cleanupError) cleanupWarning = "บันทึกรูปใหม่แล้ว แต่ลบไฟล์รูปเดิมไม่สำเร็จ โปรดแจ้งผู้ดูแลระบบ";
  }
  return { avatarPath: nextPath, error: null, cleanupWarning };
}

/**
 * Clears the profile reference before best-effort cleanup. Deterministic
 * objects are deliberately retained: Storage deletion cannot be made atomic
 * with the profile RPC and could otherwise delete a concurrent replacement.
 * The fixed per-user key keeps this retained object strictly bounded.
 */
export async function removeMyAvatar(
  supabase: SupabaseClient,
  currentPath: string,
): Promise<AvatarPersistenceResult> {
  if (!isAvatarStoragePath(currentPath)) {
    return { avatarPath: currentPath, error: "ที่อยู่ไฟล์รูปโปรไฟล์ไม่ถูกต้อง", cleanupWarning: null };
  }
  const auth = await authenticatedAvatarUser(supabase);
  if (!auth.userId) return { avatarPath: currentPath, error: auth.error, cleanupWarning: null };
  if (isDeterministicAvatarStoragePath(currentPath) && currentPath !== avatarStoragePath(auth.userId)) {
    return { avatarPath: currentPath, error: "ที่อยู่ไฟล์รูปโปรไฟล์ไม่ถูกต้อง", cleanupWarning: null };
  }

  const writeError = await writeMyAvatarPath(supabase, null);
  if (writeError) {
    const persisted = await readMyAvatarPath(supabase, auth.userId);
    if (!persisted.ok || persisted.avatarPath !== null) {
      return { avatarPath: currentPath, error: writeError, cleanupWarning: null };
    }
  }

  const cleanupError = isLegacyAvatarStoragePath(currentPath)
    ? await removeAvatarObject(supabase, currentPath)
    : null;
  if (!cleanupError) clearAvatarSignedUrlCache(supabase, currentPath);
  return {
    avatarPath: null,
    error: null,
    cleanupWarning: cleanupError
      ? "นำรูปออกจากบัญชีแล้ว แต่ลบไฟล์เดิมไม่สำเร็จ โปรดแจ้งผู้ดูแลระบบ"
      : null,
  };
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
