import { parseYouTubeVideoId } from "@/lib/youtube";

/**
 * The admin form's optional "how to play" YouTube link (migration 058).
 *
 * The database stores only the 11-character video id. This module turns what
 * the admin pasted into that id and decides whether anything needs saving, so a
 * save that does not touch the field never calls the video RPC (and keeps
 * working on a database that does not have migration 058 yet).
 */

export const VIDEO_UNAVAILABLE_NOTICE =
  "ยังตั้งวิดีโอจากหน้านี้ไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 058 — บันทึกสื่อด้วยช่องอื่นได้ตามปกติ";

export const VIDEO_RULE_HELP = "วางลิงก์ YouTube แบบปกติ youtu.be หรือ Shorts ระบบจะเก็บเฉพาะรหัสวิดีโอ";

export type VideoFieldState =
  | { kind: "empty"; hasSaved: boolean }
  | { kind: "invalid"; message: string }
  | { kind: "unchanged"; videoId: string }
  | { kind: "new"; videoId: string }
  | { kind: "changed"; videoId: string };

/** What the field currently means, given the video id already saved ("" when none). */
export function videoFieldState(input: string, saved: string): VideoFieldState {
  const text = input.trim();
  if (!text) return { kind: "empty", hasSaved: Boolean(saved) };
  const videoId = parseYouTubeVideoId(text);
  if (!videoId) return { kind: "invalid", message: `ลิงก์วิดีโอไม่ถูกต้อง: ${VIDEO_RULE_HELP}` };
  if (videoId === saved) return { kind: "unchanged", videoId };
  return { kind: saved ? "changed" : "new", videoId };
}

export type VideoSaveChange = { changed: false } | { changed: true; videoId: string | null };

/**
 * What to send after the resource row is saved. Emptying the field on a
 * resource that has a video removes it (videoId null); an invalid value is
 * never sent (the caller blocks saving on it first).
 */
export function videoChangeForSave(input: string, saved: string): VideoSaveChange {
  const state = videoFieldState(input, saved);
  if (state.kind === "empty") return state.hasSaved ? { changed: true, videoId: null } : { changed: false };
  if (state.kind === "new" || state.kind === "changed") return { changed: true, videoId: state.videoId };
  return { changed: false };
}

/** The link shown in the form for an already-saved id. */
export function videoLinkForId(videoId: string | null | undefined): string {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

/** True when a select failed because the column is missing (before 058) or not readable by this role. */
export function isVideoUnavailable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (/youtube_video_id/i.test(message) && (error.code === "42703" || /column|schema cache/i.test(message))) return true;
  return error.code === "42501" || /permission denied/i.test(message);
}
