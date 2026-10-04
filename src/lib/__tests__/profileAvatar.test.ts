import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  avatarCropRect,
  avatarSignedUrl,
  avatarStoragePath,
  avatarUrlRefreshDelay,
  cachedAvatarUrl,
  clearAvatarSignedUrlCache,
  cropAndOptimizeAvatar,
  DEFAULT_AVATAR_CROP,
  isAvatarStoragePath,
  panAvatarCrop,
  primeAvatarPreview,
  PROFILE_AVATAR_LOCAL_PREVIEW_MS,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS,
  updateMyAvatar,
  validateAvatarFile,
} from "../profileAvatar";

describe("profile avatar validation", () => {
  it("accepts safe raster image types within the upload limit", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: "image/png", size: PROFILE_AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: "image/webp", size: 2048 })).toBeNull();
  });

  it("rejects SVG, empty, and oversized files", () => {
    expect(validateAvatarFile({ type: "image/svg+xml", size: 1024 })).toMatch(/JPG/);
    expect(validateAvatarFile({ type: "image/png", size: 0 })).toMatch(/ว่าง/);
    expect(validateAvatarFile({ type: "image/png", size: PROFILE_AVATAR_MAX_BYTES + 1 })).toMatch(/5 MB/);
  });

  it("uses an opaque UUID path that does not contain an auth user id", () => {
    const objectId = "11111111-2222-4333-8444-555555555555";
    const userId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const path = avatarStoragePath(objectId);

    expect(path).toBe("avatars/11111111-2222-4333-8444-555555555555.webp");
    expect(path).not.toContain(userId);
    expect(isAvatarStoragePath(path)).toBe(true);
    expect(isAvatarStoragePath(`${userId}/avatar-1234.webp`)).toBe(false);
    expect(() => avatarStoragePath("../other-user")).toThrow(/Invalid avatar object id/);
  });

  it("calculates a bounded square crop across zoom and pan", () => {
    expect(avatarCropRect(1200, 800, DEFAULT_AVATAR_CROP)).toEqual({
      x: 200,
      y: 0,
      size: 800,
    });
    expect(avatarCropRect(1200, 800, { zoom: 2, positionX: -1, positionY: 1 })).toEqual({
      x: 0,
      y: 400,
      size: 400,
    });
    expect(avatarCropRect(800, 1200, { zoom: 99, positionX: 99, positionY: -99 })).toEqual({
      x: 800 - (800 / 3),
      y: 0,
      size: 800 / 3,
    });
  });

  it("converts drag movement to image pan and clamps it inside the source", () => {
    const moved = panAvatarCrop(
      { zoom: 2, positionX: 0, positionY: 0 },
      100,
      -100,
      200,
      1200,
      800,
    );

    expect(moved.positionX).toBeLessThan(0);
    expect(moved.positionY).toBeGreaterThan(0);
    expect(panAvatarCrop(moved, -10_000, 10_000, 200, 1200, 800)).toMatchObject({
      positionX: 1,
      positionY: -1,
    });
  });

  it("renders the selected crop to a compressed 512px WebP in the browser", async () => {
    const bitmap = { width: 1200, height: 800, close: vi.fn() };
    const drawImage = vi.fn();
    const context = { clearRect: vi.fn(), drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((resolve: (blob: Blob) => void, type: string, quality: number) => {
        expect(type).toBe("image/webp");
        expect(quality).toBeLessThan(1);
        resolve(new Blob(["compressed"], { type }));
      }),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) });

    try {
      const file = { type: "image/jpeg", size: 1024 } as File;
      const blob = await cropAndOptimizeAvatar(file, { zoom: 2, positionX: -1, positionY: 1 });

      expect(blob.type).toBe("image/webp");
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(512);
      expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 400, 400, 400, 0, 0, 512, 512);
      expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.imageSmoothingQuality).toBe("high");
      expect(bitmap.close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates and caches a short-lived signed URL for the private bucket", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/profile-avatars/avatar.webp?token=signed" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const supabase = { storage: { from } } as unknown as SupabaseClient;
    const path = avatarStoragePath("11111111-2222-4333-8444-555555555555");

    await expect(avatarSignedUrl(supabase, path)).resolves.toContain("token=signed");
    await expect(avatarSignedUrl(supabase, path)).resolves.toContain("token=signed");
    expect(from).toHaveBeenCalledWith("profile-avatars");
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith(path, PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS);

    clearAvatarSignedUrlCache(supabase, path);
    await avatarSignedUrl(supabase, path);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("refuses to sign paths outside the private avatar namespace", async () => {
    const supabase = { storage: { from: vi.fn() } } as unknown as SupabaseClient;
    await expect(avatarSignedUrl(supabase, "someone/avatar.webp")).rejects.toThrow(/Invalid avatar path/);
  });

  it("serves a local optimized preview immediately, then disposes it from cache", async () => {
    const createSignedUrl = vi.fn();
    const supabase = {
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as unknown as SupabaseClient;
    const path = avatarStoragePath("11111111-2222-4333-8444-555555555555");
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    primeAvatarPreview(supabase, path, new Blob(["optimized"], { type: "image/webp" }));
    expect(cachedAvatarUrl(supabase, path)).toBe("blob:avatar-preview");
    await expect(avatarSignedUrl(supabase, path)).resolves.toBe("blob:avatar-preview");
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(avatarUrlRefreshDelay(supabase, path)).toBeGreaterThan(0);
    expect(avatarUrlRefreshDelay(supabase, path)).toBeLessThanOrEqual(PROFILE_AVATAR_LOCAL_PREVIEW_MS);

    clearAvatarSignedUrlCache(supabase, path);
    expect(cachedAvatarUrl(supabase, path)).toBeNull();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:avatar-preview");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("automatically revokes and evicts a local preview when its short lifetime expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T00:00:00.000Z"));
    const supabase = { storage: { from: vi.fn() } } as unknown as SupabaseClient;
    const path = avatarStoragePath("22222222-2222-4222-8222-222222222222");
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:expiring-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    try {
      primeAvatarPreview(supabase, path, new Blob(["optimized"], { type: "image/webp" }));
      expect(cachedAvatarUrl(supabase, path)).toBe("blob:expiring-preview");

      await vi.advanceTimersByTimeAsync(PROFILE_AVATAR_LOCAL_PREVIEW_MS - 1);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(cachedAvatarUrl(supabase, path)).toBe("blob:expiring-preview");

      await vi.advanceTimersByTimeAsync(1);
      expect(revokeObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:expiring-preview");
      expect(cachedAvatarUrl(supabase, path)).toBeNull();
    } finally {
      clearAvatarSignedUrlCache(supabase, path);
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not let an older preview expiry delete a newer cache entry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T00:00:00.000Z"));
    const supabase = { storage: { from: vi.fn() } } as unknown as SupabaseClient;
    const path = avatarStoragePath("33333333-3333-4333-8333-333333333333");
    const createObjectURL = vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:older-preview")
      .mockReturnValueOnce("blob:newer-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    try {
      primeAvatarPreview(supabase, path, new Blob(["older"], { type: "image/webp" }));
      await vi.advanceTimersByTimeAsync(1_000);
      primeAvatarPreview(supabase, path, new Blob(["newer"], { type: "image/webp" }));

      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenNthCalledWith(1, "blob:older-preview");
      expect(cachedAvatarUrl(supabase, path)).toBe("blob:newer-preview");

      await vi.advanceTimersByTimeAsync(PROFILE_AVATAR_LOCAL_PREVIEW_MS - 1_000);
      expect(cachedAvatarUrl(supabase, path)).toBe("blob:newer-preview");
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(cachedAvatarUrl(supabase, path)).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenNthCalledWith(2, "blob:newer-preview");
    } finally {
      clearAvatarSignedUrlCache(supabase, path);
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      vi.useRealTimers();
    }
  });

  it("revokes the fallback object URL when image decoding rejects", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:decode-failure");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const decode = vi.fn().mockRejectedValue(new Error("decode failed"));
    class FailingImage {
      decoding = "auto";
      src = "";
      naturalWidth = 0;
      naturalHeight = 0;
      decode = decode;
    }
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", FailingImage);

    try {
      const file = { type: "image/png", size: 1024 } as File;
      await expect(cropAndOptimizeAvatar(file)).rejects.toThrow("decode failed");
      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(revokeObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:decode-failure");
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("updates only the authenticated caller's avatar column", async () => {
    const path = avatarStoragePath("11111111-2222-4333-8444-555555555555");
    const maybeSingle = vi.fn().mockResolvedValue({ data: { avatar_path: path }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } },
      error: null,
    });
    const supabase = { auth: { getUser }, from } as unknown as SupabaseClient;

    await expect(updateMyAvatar(supabase, path)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ avatar_path: path });
    expect(eq).toHaveBeenCalledWith("id", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(select).toHaveBeenCalledWith("avatar_path");
  });

  it("fails closed before profile access without a validated authenticated user", async () => {
    const from = vi.fn();
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from,
    } as unknown as SupabaseClient;

    await expect(updateMyAvatar(supabase, null)).resolves.toMatch(/เซสชันหมดอายุ/);
    expect(from).not.toHaveBeenCalled();
  });
});
