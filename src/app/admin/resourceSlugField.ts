import { SITE_ORIGIN } from "@/lib/site";
import { isValidSlug, slugify, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from "@/lib/resourceSlug";

/**
 * The admin form's "readable address" (slug) field.
 *
 * The database is the authority (migration 053's CHECK and unique index, and
 * migration 055's admin_save_resource). Everything here only gives the admin an
 * early, readable answer and decides what the form sends.
 */

export const SLUG_UNAVAILABLE_NOTICE =
  "ยังตั้งหรือดู slug จากหน้านี้ไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 055 — บันทึกสื่อด้วยช่องอื่นได้ตามปกติ";

export const SLUG_RULE_HELP =
  `ใช้ตัวพิมพ์เล็กภาษาอังกฤษ ตัวเลข และขีดกลาง (-) ยาว ${SLUG_MIN_LENGTH}–${SLUG_MAX_LENGTH} ตัวอักษร เช่น sentence-train`;

export type SlugFieldState =
  | { kind: "empty"; hasSaved: boolean }
  | { kind: "invalid"; message: string }
  | { kind: "unchanged" }
  | { kind: "new" }
  | { kind: "changed" };

/** What the field currently means, given the slug already saved ("" when none). */
export function slugFieldState(input: string, saved: string): SlugFieldState {
  const value = input.trim();
  if (!value) return { kind: "empty", hasSaved: Boolean(saved) };
  if (!isValidSlug(value)) return { kind: "invalid", message: `รูปแบบไม่ถูกต้อง: ${SLUG_RULE_HELP}` };
  if (value === saved) return { kind: "unchanged" };
  return { kind: saved ? "changed" : "new" };
}

/**
 * The p_slug argument to send, or null to leave it out. Left out when blank,
 * when unchanged and when invalid (the caller blocks saving on invalid), so a
 * save that does not touch the field also works on a database without 055.
 */
export function slugParamForSave(input: string, saved: string): string | null {
  const state = slugFieldState(input, saved);
  return state.kind === "new" || state.kind === "changed" ? input.trim() : null;
}

/** The public address a slug gives the resource. */
export function resourceAddress(slug: string): string {
  return `${SITE_ORIGIN}/resources/${slug}`;
}

/** A starting point taken from the title's Latin letters; "" for Thai-only titles. */
export function suggestSlug(title: string): string {
  return slugify(title);
}

/** Thai message for the two refusals admin_save_resource can give about the slug, else null. */
export function thaiSlugSaveError(message: string | null | undefined): string | null {
  const text = message ?? "";
  if (/Resource slug is invalid/i.test(text)) return `รูปแบบ slug ไม่ถูกต้อง: ${SLUG_RULE_HELP}`;
  if (/Resource slug is already in use/i.test(text)) return "slug นี้ถูกใช้กับสื่ออื่นแล้ว กรุณาใช้ชื่ออื่น";
  // A database that has not had migration 055 applied does not know the p_slug argument.
  if (/p_slug/i.test(text) && /(function|schema cache|could not find)/i.test(text)) {
    return "ฐานข้อมูลยังไม่รองรับการตั้ง slug ในหน้านี้ (ต้องติดตั้ง migration 055 ก่อน) — บันทึกสื่อโดยไม่แก้ช่อง slug ได้ตามปกติ";
  }
  return null;
}

/**
 * True when reading the slug column failed because the database is not ready for it: the column
 * does not exist yet (before migration 053) or the signed-in role may not read it yet (053 added
 * the column without the column-level grant that migration 055 adds). The admin console then
 * retries without the column instead of losing the whole resource list.
 */
export function isSlugUnavailable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return isMissingSlugColumn(error) || error.code === "42501" || /permission denied/i.test(error.message ?? "");
}

/** True when a select failed only because the slug column does not exist yet (before migration 053). */
export function isMissingSlugColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return /\bslug\b/i.test(message) && (error.code === "42703" || /column|schema cache/i.test(message));
}
