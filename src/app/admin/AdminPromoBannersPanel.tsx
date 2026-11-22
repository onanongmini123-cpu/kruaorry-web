"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { compressToWebp } from "@/lib/imageWebp";
import { refreshPublicPages } from "@/lib/refreshPublicPages";
import { bannersPayload, draftsFromRows, EMPTY_BANNER_DRAFT, PROMO_BANNER_LIMIT, type BannerDraft } from "@/lib/promoBanners";

const BUCKET = "resource-covers";
const DESKTOP_MAX_WIDTH = 1600;
const MOBILE_MAX_WIDTH = 1080;

function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || (/promo_banners/i.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? ""));
}

/** Moves one item of a list by `delta` places; out-of-range moves return the list unchanged. */
export function moveBanner<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Admin editor for the homepage promo banners (migration 061). */
export function AdminPromoBannersPanel({ supabase }: { supabase: SupabaseClient }) {
  const [drafts, setDrafts] = useState<BannerDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const query = useCallback(
    () => supabase.from("promo_banners").select("position, image_url, image_mobile_url, link_url, alt_text, is_active, starts_at, ends_at").order("position", { ascending: true }),
    [supabase],
  );

  const apply = useCallback((result: { data: unknown; error: { code?: string | null; message?: string | null } | null }) => {
    if (result.error) {
      if (isMissingTable(result.error)) setSupported(false);
      else setMessage({ tone: "error", text: `โหลดแบนเนอร์ไม่สำเร็จ: ${result.error.message ?? ""}` });
      setLoaded(true);
      return;
    }
    setDrafts(draftsFromRows(result.data));
    setSupported(true);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(query()).then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [query, apply]);

  const update = (index: number, patch: Partial<BannerDraft>) =>
    setDrafts((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const upload = async (index: number, field: "imageUrl" | "imageMobileUrl", file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await compressToWebp(file, field === "imageUrl" ? DESKTOP_MAX_WIDTH : MOBILE_MAX_WIDTH);
      const path = `banners/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: "image/webp" });
      if (error) throw new Error(error.message);
      update(index, { [field]: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
      setMessage({ tone: "ok", text: `ย่อและอัปโหลดรูปแล้ว (${Math.round(blob.size / 1024)} KB) กด “บันทึกแบนเนอร์” เพื่อใช้งานจริง` });
    } catch (thrown) {
      setMessage({ tone: "error", text: `อัปโหลดรูปไม่สำเร็จ: ${thrown instanceof Error ? thrown.message : String(thrown)}` });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const payload = bannersPayload(drafts);
    if (!payload.ok) {
      setMessage({ tone: "error", text: payload.message });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("admin_set_promo_banners", { p_banners: payload.banners });
    if (error) {
      setBusy(false);
      setMessage({ tone: "error", text: `บันทึกไม่สำเร็จ: ${error.message}` });
      return;
    }
    const refreshed = await refreshPublicPages();
    setBusy(false);
    setMessage({
      tone: "ok",
      text: refreshed
        ? (payload.banners.length === 0 ? "ลบแบนเนอร์ทั้งหมดแล้ว ส่วนประชาสัมพันธ์ถูกซ่อนแล้ว" : "บันทึกแล้ว หน้าแรกอัปเดตแล้ว")
        : "บันทึกแล้ว หน้าแรกจะอัปเดตภายในประมาณ 5 นาที",
    });
    apply(await query());
  };

  return (
    <section className="kru-card" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-6)", display: "grid", gap: "var(--sp-4)" }} aria-labelledby="admin-banners-title">
      <div>
        <h2 id="admin-banners-title" style={{ fontSize: "var(--fs-20)" }}>แบนเนอร์ประชาสัมพันธ์หน้าแรก</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-14)" }}>
          ใส่ได้สูงสุด {PROMO_BANNER_LIMIT} แบนเนอร์ เลื่อนอัตโนมัติทุก 5 วินาที ไม่มีแบนเนอร์ = ซ่อนทั้งส่วน · รูปคอมอัตราส่วน 16:9 (เช่น 1600×900) รูปมือถือ 4:5 (เช่น 1080×1350) ไม่บังคับ ·
          ระบบย่อและแปลงเป็น WebP ให้อัตโนมัติก่อนอัปโหลด · ลิงก์ขึ้นต้นด้วย https:// (เปิดแท็บใหม่) หรือ / เช่น /resources (หน้าในเว็บ)
        </p>
      </div>
      {!loaded ? (
        <p role="status">กำลังโหลด…</p>
      ) : !supported ? (
        <p role="status" style={{ color: "var(--status-warning-fg)" }}>ยังตั้งแบนเนอร์ไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 061</p>
      ) : (
        <>
          {drafts.length === 0 && <p style={{ color: "var(--text-muted)" }}>ยังไม่มีแบนเนอร์ ส่วนนี้ถูกซ่อนบนหน้าแรก</p>}
          {drafts.map((draft, index) => (
            <fieldset key={index} className="kru-card" style={{ padding: "var(--sp-4)", display: "grid", gap: "var(--sp-3)", border: "1px solid var(--border-subtle)" }}>
              <legend style={{ fontWeight: "var(--fw-semibold)" }}>แบนเนอร์ที่ {index + 1}{draft.isActive ? "" : " (ปิดอยู่)"}</legend>
              <div className="kru-admin-form-grid">
                <div style={{ display: "grid", gap: "var(--sp-2)" }}>
                  <label htmlFor={`banner-img-${index}`}>รูปสำหรับคอม (จำเป็น)</label>
                  <input id={`banner-img-${index}`} type="file" accept="image/*" disabled={busy} onChange={(event) => { void upload(index, "imageUrl", event.target.files?.[0]); event.target.value = ""; }} />
                  {draft.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.imageUrl} alt="ตัวอย่างรูปคอม" style={{ width: "100%", maxWidth: 360, aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "var(--r-md)" }} />
                  )}
                </div>
                <div style={{ display: "grid", gap: "var(--sp-2)" }}>
                  <label htmlFor={`banner-mob-${index}`}>รูปสำหรับมือถือ (ไม่บังคับ)</label>
                  <input id={`banner-mob-${index}`} type="file" accept="image/*" disabled={busy} onChange={(event) => { void upload(index, "imageMobileUrl", event.target.files?.[0]); event.target.value = ""; }} />
                  {draft.imageMobileUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={draft.imageMobileUrl} alt="ตัวอย่างรูปมือถือ" style={{ width: "100%", maxWidth: 160, aspectRatio: "4 / 5", objectFit: "cover", borderRadius: "var(--r-md)" }} />
                      <Button size="sm" variant="secondary" onClick={() => update(index, { imageMobileUrl: "" })}>ลบรูปมือถือ</Button>
                    </>
                  )}
                </div>
              </div>
              <Input label="ลิงก์เมื่อกดแบนเนอร์ (ไม่บังคับ)" value={draft.linkUrl} inputMode="url" placeholder="https://… หรือ /resources" onChange={(event) => update(index, { linkUrl: event.target.value })} />
              <Input label="ข้อความ alt อธิบายรูป (จำเป็น)" value={draft.altText} maxLength={160} onChange={(event) => update(index, { altText: event.target.value })} />
              <div className="kru-admin-form-grid">
                <Input label="วันเริ่ม (ไม่บังคับ)" type="date" value={draft.startDate} onChange={(event) => update(index, { startDate: event.target.value })} />
                <Input label="วันสิ้นสุด — แสดงถึงวันนี้ (ไม่บังคับ)" type="date" value={draft.endDate} onChange={(event) => update(index, { endDate: event.target.value })} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minHeight: "var(--tap-min)" }}>
                <input type="checkbox" checked={draft.isActive} onChange={(event) => update(index, { isActive: event.target.checked })} /> แสดงบนหน้าแรก
              </label>
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <Button size="sm" variant="secondary" icon={ArrowUp} disabled={index === 0 || busy} onClick={() => setDrafts((current) => moveBanner(current, index, -1))}>ขึ้น</Button>
                <Button size="sm" variant="secondary" icon={ArrowDown} disabled={index === drafts.length - 1 || busy} onClick={() => setDrafts((current) => moveBanner(current, index, 1))}>ลง</Button>
                <Button size="sm" variant="secondary" icon={Trash2} disabled={busy} onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}>ลบ</Button>
              </div>
            </fieldset>
          ))}
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} style={{ color: message.tone === "error" ? "var(--status-danger-fg)" : "var(--status-success-fg)" }}>
              {message.text}
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <Button variant="secondary" icon={Plus} disabled={busy || drafts.length >= PROMO_BANNER_LIMIT} onClick={() => setDrafts((current) => [...current, { ...EMPTY_BANNER_DRAFT }])}>เพิ่มแบนเนอร์</Button>
            <Button onClick={() => void save()} loading={busy}>บันทึกแบนเนอร์</Button>
          </div>
        </>
      )}
    </section>
  );
}
