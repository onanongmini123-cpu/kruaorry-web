import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  avatarSignedUrl,
  avatarStoragePath,
  clearAvatarSignedUrlCache,
  isAvatarStoragePath,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_SIGNED_URL_TTL_SECONDS,
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
});
