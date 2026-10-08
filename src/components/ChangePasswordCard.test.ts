import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync(new URL("./ChangePasswordCard.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./ProfileSettings.tsx", import.meta.url), "utf8");

describe("change password account card contract", () => {
  it("renders only when the authenticated user has an email password identity", () => {
    expect(settingsSource).toContain("{passwordAuthEmail && (");
    expect(settingsSource).toContain("<ChangePasswordCard");
  });

  it("connects friendly errors and success feedback to accessible live regions", () => {
    expect(cardSource).toContain('id="change-password-error" role="alert"');
    expect(cardSource).toContain('role="status" aria-live="polite"');
    expect(cardSource.match(/aria-describedby=\{describedBy\}/g)).toHaveLength(3);
  });

  it("clears all password fields and visibility controls after success", () => {
    expect(cardSource).toContain('setCurrentPassword("")');
    expect(cardSource).toContain('setNewPassword("")');
    expect(cardSource).toContain('setConfirmPassword("")');
    expect(cardSource).toContain("setShowCurrentPassword(false)");
    expect(cardSource).toContain("setShowNewPassword(false)");
    expect(cardSource).toContain("setShowConfirmPassword(false)");
    expect(cardSource).toContain('setMessage("เปลี่ยนรหัสผ่านแล้ว")');
  });
});
