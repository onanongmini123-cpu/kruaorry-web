import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cropperSource = readFileSync(new URL("./AvatarCropper.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./ProfileSettings.tsx", import.meta.url), "utf8");

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
    expect(settingsSource).toContain('contentType: "image/webp"');
    expect(settingsSource).toContain("upsert: false");
    expect(settingsSource).toContain("updateMyAvatar(supabase, uploadedPath)");
    expect(settingsSource).toContain("primeAvatarPreview(supabase, uploadedPath, blob)");
    expect(settingsSource).toContain("onUpdated({ ...profile, avatarPath: uploadedPath })");

    const persisted = settingsSource.indexOf("updateMyAvatar(supabase, uploadedPath)");
    const refreshed = settingsSource.indexOf("onUpdated({ ...profile, avatarPath: uploadedPath })");
    expect(refreshed).toBeGreaterThan(persisted);
  });
});
