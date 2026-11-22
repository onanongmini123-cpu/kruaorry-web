"use client";

import { refreshPublicPages } from "@/lib/refreshPublicPages";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui";
import { groupPreviewRows, MAX_RESOURCE_PREVIEWS } from "@/lib/resourcePreviews";
import { watermarkImageFile } from "@/lib/previewWatermark";

const BUCKET = "resource-covers";

function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || (/resource_previews/i.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? ""));
}

/** Moves one item of a list by `delta` places; out-of-range moves return the list unchanged. */
export function movePreview<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Admin editor for a Pro resource's "try before you buy" pictures (migration 059).
 * Every picture is watermarked in the browser BEFORE it is uploaded, so an
 * unwatermarked copy never reaches the public bucket from this screen.
 * Saved separately from the resource form, and only for an existing resource.
 */
export function AdminResourcePreviewsField({ supabase, resourceId }: { supabase: SupabaseClient; resourceId: string | null }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const apply = useCallback((result: { data: unknown; error: { code?: string | null; message?: string | null } | null }) => {
    if (result.error) {
      if (isMissingTable(result.error)) setSupported(false);
      else setMessage({ tone: "error", text: `โหลดรูปตัวอย่างไม่สำเร็จ: ${result.error.message ?? ""}` });
      setLoaded(true);
      return;
    }
    const rows = (Array.isArray(result.data) ? result.data : []).map((row) => ({ ...(row as object), resource_id: resourceId }));
    setUrls(groupPreviewRows(rows).get(resourceId ?? "") ?? []);
    setSupported(true);
    setLoaded(true);
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId) return undefined;
    let active = true;
    void Promise.resolve(supabase.from("resource_previews").select("position, image_url").eq("resource_id", resourceId).order("position", { ascending: true }))
      .then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [supabase, resourceId, apply]);

  if (!resourceId) {
    return <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>บันทึกสื่อก่อน แล้วกลับมาเพิ่มรูปตัวอย่างมีลายน้ำได้ตอนแก้ไข</p>;
  }
  if (!loaded) return <p role="status">กำลังโหลดรูปตัวอย่าง…</p>;
  if (!supported) {
    return <p role="status" style={{ color: "var(--status-warning-fg)" }}>ยังเพิ่มรูปตัวอย่างไม่ได้ เพราะฐานข้อมูลยังไม่ได้ติดตั้ง migration 059</p>;
  }

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_RESOURCE_PREVIEWS - urls.length;
    if (room <= 0) {
      setMessage({ tone: "error", text: `ใส่ได้สูงสุด ${MAX_RESOURCE_PREVIEWS} รูป` });
      return;
    }
    setBusy(true);
    setMessage(null);
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const blob = await watermarkImageFile(file);
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        const path = `previews/${resourceId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type });
        if (error) throw new Error(error.message);
        added.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }
      setUrls((current) => [...current, ...added]);
      setMessage({ tone: "ok", text: `เติมลายน้ำและอัปโหลด ${added.length} รูปแล้ว กด “บันทึกรูปตัวอย่าง” เพื่อใช้งานจริง` });
    } catch (thrown) {
      if (added.length > 0) setUrls((current) => [...current, ...added]);
      setMessage({ tone: "error", text: `เพิ่มรูปตัวอย่างไม่สำเร็จ: ${thrown instanceof Error ? thrown.message : String(thrown)}` });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("admin_set_resource_previews", { p_resource_id: resourceId, p_urls: urls });
    const refreshed = error ? false : await refreshPublicPages();
    setBusy(false);
    setMessage(error
      ? { tone: "error", text: `บันทึกรูปตัวอย่างไม่สำเร็จ: ${error.message}` }
      : { tone: "ok", text: refreshed ? "บันทึกรูปตัวอย่างแล้ว หน้าสื่ออัปเดตแล้ว" : "บันทึกรูปตัวอย่างแล้ว จะแสดงบนหน้าสื่อภายในประมาณ 5 นาที" });
  };

  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>
        ใช้กับสื่อ Teacher Pro ที่เผยแพร่แล้วเท่านั้น (สูงสุด {MAX_RESOURCE_PREVIEWS} รูป) ระบบเติมลายน้ำ “KruAorry.com – ตัวอย่าง” ให้อัตโนมัติก่อนอัปโหลด
        เลือกหน้าที่เห็นภาพรวมได้โดยไม่เปิดเผยเนื้อหาทั้งหมด รูปนี้เป็นสาธารณะ ใครก็ดูได้
      </p>
      {urls.length > 0 && (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--sp-3)" }}>
          {urls.map((url, index) => (
            <li key={url} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`รูปตัวอย่างที่ ${index + 1}`} width={120} height={80} style={{ objectFit: "cover", borderRadius: 6 }} referrerPolicy="no-referrer" />
              <Button type="button" variant="secondary" size="sm" disabled={busy || index === 0} onClick={() => setUrls((current) => movePreview(current, index, -1))}>เลื่อนขึ้น</Button>
              <Button type="button" variant="secondary" size="sm" disabled={busy || index === urls.length - 1} onClick={() => setUrls((current) => movePreview(current, index, 1))}>เลื่อนลง</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setUrls((current) => current.filter((_, i) => i !== index))}>นำออก</Button>
            </li>
          ))}
        </ol>
      )}
      <div>
        <label className="kru-field__label" htmlFor="preview-files">เพิ่มรูปตัวอย่าง</label>
        <input id="preview-files" type="file" accept="image/*" multiple disabled={busy || urls.length >= MAX_RESOURCE_PREVIEWS} onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} style={{ color: message.tone === "error" ? "var(--status-danger-fg)" : "var(--status-success-fg)" }}>{message.text}</p>
      )}
      <div>
        <Button type="button" onClick={() => void save()} loading={busy}>บันทึกรูปตัวอย่าง</Button>
      </div>
    </div>
  );
}
