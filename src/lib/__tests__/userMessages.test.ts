import { describe, expect, it } from "vitest";
import {
  DUPLICATE_ERROR,
  GENERIC_ACTION_ERROR,
  GENERIC_LOAD_ERROR,
  NETWORK_ERROR,
  PERMISSION_ERROR,
  SESSION_EXPIRED_ERROR,
  SYSTEM_UPDATING_ERROR,
  friendlyErrorMessage,
} from "../userMessages";

const JARGON = /supabase|postgres|pgrst|\brls\b|row-level|\bjwt\b|signed url|service[ _-]?role|\bsql\b|database|schema cache|failed to fetch|\bnull\b|violates|invalid/i;

describe("friendlyErrorMessage", () => {
  it("maps our own database messages to specific Thai copy", () => {
    expect(friendlyErrorMessage({ message: "Request rate limit reached" })).toBe("วันนี้ส่งคำขอครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้");
    expect(friendlyErrorMessage({ message: "Published entitled resource required" })).toContain("ยังไม่มีสิทธิ์ใช้สื่อนี้");
    expect(friendlyErrorMessage("Display name must contain 2 to 80 characters")).toBe("ชื่อที่แสดงต้องมี 2–80 ตัวอักษร");
    expect(friendlyErrorMessage({ message: "Membership application is no longer pending" })).toContain("ถูกดำเนินการไปแล้ว");
    expect(friendlyErrorMessage({ message: "Cannot demote the last remaining owner" })).toContain("เจ้าของระบบคนสุดท้าย");
  });

  it("does not hard-code a favourites limit that comes from plan configuration", () => {
    expect(friendlyErrorMessage({ message: "Saved resource limit reached for this membership" })).not.toMatch(/\d/);
  });

  it("hides auth, network, permission and schema jargon", () => {
    expect(friendlyErrorMessage({ message: "Invalid JWT" })).toBe(SESSION_EXPIRED_ERROR);
    expect(friendlyErrorMessage({ message: "Auth session missing!" })).toBe(SESSION_EXPIRED_ERROR);
    expect(friendlyErrorMessage(new TypeError("Failed to fetch"))).toBe(NETWORK_ERROR);
    expect(friendlyErrorMessage({ message: 'new row violates row-level security policy for table "x"' })).toBe(PERMISSION_ERROR);
    expect(friendlyErrorMessage({ code: "42501", message: "permission denied for table x" })).toBe(PERMISSION_ERROR);
    expect(friendlyErrorMessage({ code: "PGRST202", message: "Could not find the function public.update_my_display_name(p_full_name) in the schema cache" })).toBe(SYSTEM_UPDATING_ERROR);
    expect(friendlyErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })).toBe(DUPLICATE_ERROR);
  });

  it("never echoes unknown English or technical text", () => {
    for (const value of [
      { message: "something unexpected from the server" },
      { message: "ERROR: relation public.secret does not exist (SQLSTATE 42P01)" },
      "TypeError: Cannot read properties of null",
      new Error("null"),
      undefined,
      null,
      {},
    ]) {
      const result = friendlyErrorMessage(value);
      expect(result, String(value)).not.toMatch(JARGON);
      expect([GENERIC_ACTION_ERROR, SYSTEM_UPDATING_ERROR].includes(result)).toBe(true);
    }
  });

  it("uses the per-action fallback when provided", () => {
    expect(friendlyErrorMessage({ message: "weird" }, GENERIC_LOAD_ERROR)).toBe("ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองอีกครั้ง");
    expect(friendlyErrorMessage(undefined, "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")).toBe("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
  });

  it("keeps Thai copy we wrote ourselves, but not Thai that carries jargon", () => {
    expect(friendlyErrorMessage({ message: "บันทึกชื่อไม่สำเร็จ กรุณาลองอีกครั้ง" })).toBe("บันทึกชื่อไม่สำเร็จ กรุณาลองอีกครั้ง");
    expect(friendlyErrorMessage({ message: "เกิดข้อผิดพลาดจาก Supabase RLS" })).toBe(GENERIC_ACTION_ERROR);
  });
});
