"use client";

import { refreshPublicPages } from "@/lib/refreshPublicPages";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, Input } from "@/components/ui";
import { HOMEPAGE_VIDEO_LIMIT, parseHomepageVideos } from "@/lib/homepageVideos";
import { parseYouTubeVideoId } from "@/lib/youtube";
import { VIDEO_RULE_HELP, videoLinkForId } from "./resourceVideoField";

export interface HomepageVideoDraft {
  link: string;
  title: string;
}

const EMPTY_SLOTS: HomepageVideoDraft[] = Array.from({ length: HOMEPAGE_VIDEO_LIMIT }, () => ({ link: "", title: "" }));

/**
 * What to send to admin_set_homepage_videos, or the first problem found.
 * Blank rows are skipped and the rest keep their order (position 1, 2, 3).
 */
export function homepageVideosPayload(slots: HomepageVideoDraft[]): { ok: true; videos: { videoId: string; title?: string }[] } | { ok: false; message: string } {
  const videos: { videoId: string; title?: string }[] = [];
  const slotOfVideo = new Map<string, number>();
  for (let index = 0; index < slots.length; index += 1) {
    const link = slots[index].link.trim();
    const title = slots[index].title.replace(/\s+/g, " ").trim();
    if (!link && !title) continue;
    if (!link) return { ok: false, message: `วิดีโอที่ ${index + 1}: มีชื่อแต่ยังไม่ได้ใส่ลิงก์` };
    const videoId = parseYouTubeVideoId(link);
    if (!videoId) return { ok: false, message: `วิดีโอที่ ${index + 1}: ลิงก์ไม่ถูกต้อง ${VIDEO_RULE_HELP}` };
    if (title.length > 80) return { ok: false, message: `วิดีโอที่ ${index + 1}: ชื่อยาวเกิน 80 ตัวอักษร` };
    const firstSlot = slotOfVideo.get(videoId);
    if (firstSlot !== undefined) return { ok: false, message: `วิดีโอที่ ${index + 1}: วิดีโอนี้ซ้ำกับช่องที่ ${firstSlot + 1}` };
    slotOfVideo.set(videoId, index);
    videos.push(title ? { videoId, title } : { videoId });
  }
  return { ok: true, videos };
}

function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /homepage_videos/i.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

/** Admin editor for the 1–3 homepage "วิดีโอแนะนำ" videos (migration 058). */
export function AdminHomepageVideosPanel({ supabase }: { supabase: SupabaseClient }) {
  const [slots, setSlots] = useState<HomepageVideoDraft[]>(EMPTY_SLOTS);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  const query = useCallback(
    () => supabase.from("homepage_videos").select("position, youtube_video_id, title").order("position", { ascending: true }),
    [supabase],
  );

  const apply = useCallback((result: { data: unknown; error: { code?: string | null; message?: string | null } | null }) => {
    if (result.error) {
      if (isMissingTable(result.error)) setSupported(false);
      else setMessage({ tone: "error", text: `โหลดวิดีโอหน้าแรกไม่สำเร็จ: ${result.error.message ?? ""}` });
      setLoaded(true);
      return;
    }
    const saved = parseHomepageVideos(result.data);
    setSlots(EMPTY_SLOTS.map((empty, index) => saved[index] ? { link: videoLinkForId(saved[index].videoId), title: saved[index].title ?? "" } : empty));
    setSupported(true);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(query()).then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [query, apply]);

  const save = async () => {
    const payload = homepageVideosPayload(slots);
    if (!payload.ok) {
      setMessage({ tone: "error", text: payload.message });
      // The message sits under the three fields; bring it into view so a refused save is never silent.
      window.requestAnimationFrame(() => messageRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("admin_set_homepage_videos", { p_videos: payload.videos });
    setSaving(false);
    if (error) {
      setMessage({ tone: "error", text: `บันทึกไม่สำเร็จ: ${error.message}` });
      return;
    }
    const refreshed = await refreshPublicPages();
    setMessage({
      tone: "ok",
      text: refreshed
        ? payload.videos.length === 0
          ? "ลบวิดีโอหน้าแรกทั้งหมดแล้ว ส่วน “วิดีโอแนะนำ” ถูกซ่อนแล้ว"
          : "บันทึกแล้ว หน้าแรกอัปเดตแล้ว"
        : payload.videos.length === 0
        ? "ลบวิดีโอหน้าแรกทั้งหมดแล้ว ส่วน “วิดีโอแนะนำ” จะถูกซ่อน (อัปเดตบนหน้าแรกภายในประมาณ 5 นาที)"
        : "บันทึกแล้ว วิดีโอจะแสดงบนหน้าแรกภายในประมาณ 5 นาที",
    });
    apply(await query());
  };

  return (
    <section className="kru-card" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-6)", display: "grid", gap: "var(--sp-4)" }} aria-labelledby="admin-home-videos-title">
      <div>
        <h2 id="admin-home-videos-title" style={{ fontSize: "var(--fs-20)" }}>วิดีโอแนะนำบนหน้าแรก</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-14)" }}>ใส่ได้ 1–3 วิดีโอ เว้นว่างทั้งหมด = ซ่อนส่วนนี้บนหน้าแรก {VIDEO_RULE_HELP}</p>
      </div>
      {!loaded ? (
        <p role="status">กำลังโหลด…</p>
      ) : !supported ? (
        <p role="status" style={{ color: "var(--status-warning-fg)" }}>ยังตั้งวิดีโอหน้าแรกไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 058</p>
      ) : (
        <>
          {slots.map((slot, index) => (
            <div key={index} className="kru-admin-form-grid">
              <Input
                label={`วิดีโอที่ ${index + 1} — ลิงก์ YouTube`}
                value={slot.link}
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, link: event.target.value } : item)))}
              />
              <Input
                label="ชื่อใต้วิดีโอ (ไม่บังคับ)"
                value={slot.title}
                maxLength={80}
                onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)))}
              />
            </div>
          ))}
          {message && (
            <p ref={messageRef} role={message.tone === "error" ? "alert" : "status"} style={{ color: message.tone === "error" ? "var(--status-danger-fg)" : "var(--status-success-fg)" }}>
              {message.text}
            </p>
          )}
          <div>
            <Button onClick={() => void save()} loading={saving}>บันทึกวิดีโอหน้าแรก</Button>
          </div>
        </>
      )}
    </section>
  );
}
