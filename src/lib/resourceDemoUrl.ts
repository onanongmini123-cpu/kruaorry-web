/**
 * "ทดลองเล่น/ดูตัวอย่าง" — the optional demo link of a resource.
 *
 * The demo is stored apart from the full version (`resources.demo_url`, never
 * `cta_url`/`file_path`) and is public by design: it is shown to everybody and
 * is never an authorization decision. The full version keeps going through
 * resolve_resource_target / the open and download routes unchanged.
 *
 * These rules are mirrored by public.resource_demo_url_is_safe (migration 061);
 * src/lib/__tests__/fixtures/demo-url-corpus.json is run against both so the
 * two cannot drift apart. The link is only ever rendered as an <a href> that an
 * administrator typed — it is never built from visitor input, so there is no
 * open redirect — but it is still held to HTTPS and a public host.
 */

import { friendlyErrorMessage } from "@/lib/userMessages";

export const DEMO_URL_MAX_LENGTH = 2048;

const LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
const TLD = "[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
// https only, no userinfo, no port, a dotted host whose last label starts with a
// letter (this also rules out IPv4/IPv6/decimal-IP hosts), then an optional
// path/query/fragment without whitespace or backslashes.
export const DEMO_URL_PATTERN = `^https://((?:${LABEL}\\.)+${TLD})(?:[/?#][^\\s\\\\]*)?$`;
export const DEMO_HOST_DENY_PATTERN =
  "(^|\\.)(example\\.(com|org|net)|vercel\\.app|pages\\.dev|workers\\.dev|trycloudflare\\.com|ngrok\\.io|ngrok-free\\.app|loca\\.lt)$"
  + "|\\.(local|localhost|internal|invalid|test|example|lan|home|corp|intranet)$";

const DEMO_URL_RE = new RegExp(DEMO_URL_PATTERN);
const DEMO_HOST_DENY_RE = new RegExp(DEMO_HOST_DENY_PATTERN);

export const DEMO_URL_HELP =
  "ต้องขึ้นต้นด้วย https:// เช่น https://games.kruaorry.com/demo/ชื่อเกม — ไม่รับ http, localhost, IP, ลิงก์ทดสอบ (Preview) หรือลิงก์ที่มีรหัสผ่าน/พอร์ต";

/** The reason a demo link is refused, in Thai, or null when it is fine. Blank is fine (no demo). */
export function demoUrlProblem(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (value.length > DEMO_URL_MAX_LENGTH) return `ลิงก์เดโมยาวเกิน ${DEMO_URL_MAX_LENGTH} ตัวอักษร`;
  if (!value.startsWith("https://")) return "ลิงก์เดโมต้องขึ้นต้นด้วย https:// เท่านั้น";
  if (value.toLowerCase().includes("placeholder")) return "ลิงก์เดโมนี้เป็นลิงก์ตัวอย่างชั่วคราว ใช้ไม่ได้";
  const match = DEMO_URL_RE.exec(value);
  if (!match) return `รูปแบบลิงก์เดโมไม่ถูกต้อง: ${DEMO_URL_HELP}`;
  if (DEMO_HOST_DENY_RE.test(match[1].toLowerCase())) {
    return "ลิงก์นี้เป็นลิงก์ภายใน/ทดสอบ (localhost, Preview, example ฯลฯ) ใช้เป็นเดโมบนเว็บจริงไม่ได้";
  }
  return null;
}

/** A demo link that is safe to put in an href, or null (hide the button). */
export function publicDemoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || demoUrlProblem(trimmed) !== null) return null;
  return trimmed;
}

function comparable(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/** Mirrors resources_demo_differs_from_full: the demo must not be the full version's own address. */
export function demoSameAsFullVersion(demo: string, full: string | null | undefined): boolean {
  if (!demo.trim() || !full || !full.trim()) return false;
  return comparable(demo) === comparable(full);
}

export type DemoMode = "none" | "url";

export const DEMO_MODE_OPTIONS: ReadonlyArray<{ value: DemoMode; label: string }> = [
  { value: "none", label: "ไม่มี" },
  { value: "url", label: "URL เดโม" },
];

export const DEMO_UNAVAILABLE_NOTICE =
  "ยังตั้งหรือดูเดโมจากหน้านี้ไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 061 — บันทึกสื่อด้วยช่องอื่นได้ตามปกติ";

export function demoModeFromUrl(url: string): DemoMode {
  return url.trim() ? "url" : "none";
}

/**
 * What to send to admin_set_resource_demo, or `undefined` for "do not call it"
 * (the field is unchanged, or the database does not have 061 yet).
 * `null` means "remove the demo".
 */
export function demoParamForSave(
  mode: DemoMode,
  input: string,
  saved: string,
  supported: boolean,
): string | null | undefined {
  if (!supported) return undefined;
  const next = mode === "url" ? input.trim() : "";
  if (next === saved.trim()) return undefined;
  return next || null;
}

/** Thai message for a database refusal of the demo link we know about, else null. */
export function thaiDemoSaveError(message: string): string | null {
  if (/Resource demo URL is invalid/i.test(message)) return `ลิงก์เดโมไม่ถูกต้อง: ${DEMO_URL_HELP}`;
  if (/Resource demo URL must differ/i.test(message)) return "ลิงก์เดโมต้องไม่ซ้ำกับลิงก์ฉบับเต็มของสื่อ";
  if (/Admin access required/i.test(message)) return "ต้องเป็นแอดมินจึงจะตั้งเดโมได้";
  return null;
}

export const DEMO_SAVE_FALLBACK = "บันทึกเดโมไม่สำเร็จ กรุณาลองอีกครั้ง หากยังไม่ได้ให้แจ้งทีมงาน";

/**
 * The sentence the admin sees when saving the demo fails. Known refusals get
 * their own Thai text; anything else goes through friendlyErrorMessage, which
 * never echoes a raw (English/database) message.
 */
export function demoSaveErrorMessage(error: unknown): string {
  const raw = error && typeof error === "object" ? (error as { message?: unknown }).message : error;
  const known = typeof raw === "string" ? thaiDemoSaveError(raw) : null;
  return known ?? friendlyErrorMessage(error, DEMO_SAVE_FALLBACK);
}

export function isDemoUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = error.message ?? "";
  return (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST200" || error.code === "PGRST202" || error.code === "42883")
    && /demo/i.test(text);
}
