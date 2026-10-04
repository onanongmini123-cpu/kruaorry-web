import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cropperSource = readFileSync(new URL("./AvatarCropper.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./ProfileSettings.tsx", import.meta.url), "utf8");
const avatarSource = readFileSync(new URL("../lib/profileAvatar.ts", import.meta.url), "utf8");

describe("profile avatar interaction contract", () => {
  it("offers a square drag crop, zoom and axis pan with a circular preview", () => {
    expect(cropperSource).toContain('width={512}');
    expect(cropperSource).toContain('height={512}');
    expect(cropperSource).toContain("onPointerMove={drag}");
    expect(cropperSource).toContain("panAvatarCrop(");
    expect(cropperSource).toContain("PROFILE_AVATAR_MIN_ZOOM");
    expect(cropperSource).toContain("PROFILE_AVATAR_MAX_ZOOM");
    expect(cropperSource).toContain("เลื่อนแนวนอน");
    expect(cropperSource).toContain("เลื่อนแนวตั้ง");
    expect(cropperSource).toContain("ตัวอย่างรูปวงกลม");
    expect(cropperSource).toContain("border-radius: 999px");
  });

  it("keeps confirm, cancel, reset and busy states explicit in Thai", () => {
    expect(cropperSource).toContain("ยืนยันและบันทึกรูป");
    expect(cropperSource).toContain("ยกเลิก");
    expect(cropperSource).toContain("จัดกึ่งกลางใหม่");
    expect(cropperSource).toContain("กำลังเตรียมรูป…");
    expect(cropperSource).toContain("กำลังบีบอัดและบันทึกรูป…");
    expect(cropperSource).toContain('role="status"');
    expect(cropperSource).toContain('role="alert"');
  });

  it("validates accepted formats, compresses before upload and refreshes every avatar immediately", () => {
    expect(settingsSource).toContain('accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"');
    expect(settingsSource).toContain("validateAvatarFile(file)");
    expect(settingsSource).toContain("cropAndOptimizeAvatar(cropFile, crop)");
    expect(settingsSource).toContain("persistMyAvatarBlob(supabase, blob, avatarPath)");
    expect(settingsSource).toContain("primeAvatarPreview(supabase, result.avatarPath, blob)");
    expect(settingsSource).toContain("onUpdated({ ...profile, avatarPath: result.avatarPath })");
    expect(avatarSource).toContain('contentType: "image/webp"');
    expect(avatarSource).toContain("upsert: true");
    expect(avatarSource).toContain('cacheControl: "60"');

    const persisted = settingsSource.indexOf("persistMyAvatarBlob(supabase, blob, avatarPath)");
    const refreshed = settingsSource.indexOf("onUpdated({ ...profile, avatarPath: result.avatarPath })");
    expect(refreshed).toBeGreaterThan(persisted);
  });

  it("serializes name, save, and removal operations and makes cancel side-effect free", () => {
    expect(settingsSource).toContain("if (operationRef.current) return");
    expect(settingsSource).toContain("if (!cropFile || busy || operationRef.current) return");
    expect(settingsSource).toContain("if (!avatarPath || busy || operationRef.current) return");
    expect(settingsSource.match(/operationRef\.current = true/g)).toHaveLength(3);
    expect(settingsSource.match(/operationRef\.current = false/g)).toHaveLength(3);

    const cancelStart = settingsSource.indexOf("onCancel={() => {");
    const cancelEnd = settingsSource.indexOf("}}", cancelStart);
    const cancel = settingsSource.slice(cancelStart, cancelEnd);
    expect(cancel).toContain("setCropFile(null)");
    expect(cancel).not.toContain("persistMyAvatarBlob");
    expect(cancel).not.toContain("updateMyAvatar");
  });

  it("saves display names through a separate RPC without carrying avatar state", () => {
    expect(settingsSource).toContain("updateMyDisplayName(supabase, normalizedName)");
    expect(settingsSource).not.toContain("updateMyDisplayName(supabase, normalizedName, avatarPath)");
  });
});
