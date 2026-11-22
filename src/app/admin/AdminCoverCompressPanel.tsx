"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui";
import { compressToWebp } from "@/lib/imageWebp";
import { refreshPublicPages } from "@/lib/refreshPublicPages";
import { loadResourceTarget } from "@/lib/resourceTarget";
import {
  COVER_BUCKET, COVER_CACHE_CONTROL, COVER_COMPRESS_MAX_WIDTH, COVER_COMPRESS_QUALITY, backupCsv, coverFileName, coverObjectPath,
  formatKb, isCompressedCoverUrl, newCompressedPath, parseBackupCsv, planCompression, sameExceptCover, saveParamsWithCover, totals,
  type CompressionCandidate, type CoverRow, type ResourceSnapshot,
} from "@/lib/coverCompression";

type Outcome = { id: string; title: string; status: "done" | "skipped" | "failed"; note: string; oldUrl?: string; newUrl?: string; saved?: number };

const COLUMNS = "title, meta, description, category, grade_levels, delivery_mode, cover_image_url, access_mode, file_size, file_mime_type";

async function readSnapshot(supabase: SupabaseClient, id: string): Promise<ResourceSnapshot | null> {
  const [row, target, plans] = await Promise.all([
    supabase.from("resources").select(COLUMNS).eq("id", id).single(),
    loadResourceTarget(supabase, id),
    supabase.from("resource_plan_access").select("plan_id").eq("resource_id", id),
  ]);
  if (row.error || !row.data || !target.target || plans.error) return null;
  const data = row.data as unknown as Record<string, unknown>;
  return {
    title: String(data.title ?? ""),
    meta: (data.meta as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    category: (data.category as string | null) ?? null,
    grade_levels: Array.isArray(data.grade_levels) ? (data.grade_levels as string[]) : [],
    delivery_mode: String(data.delivery_mode ?? ""),
    cta_url: target.target.cta_url,
    cover_image_url: (data.cover_image_url as string | null) ?? null,
    file_path: target.target.file_path,
    file_name: target.target.file_name,
    file_size: typeof data.file_size === "number" ? data.file_size : null,
    file_mime_type: (data.file_mime_type as string | null) ?? null,
    access_mode: String(data.access_mode ?? ""),
    plan_ids: (plans.data ?? []).map((p) => String((p as { plan_id: unknown }).plan_id)),
  };
}

/**
 * Changes ONLY a resource's cover. It reads the resource, saves it again with the
 * same values and the new cover, reads it back, and if anything else differs it
 * puts the first copy back and reports a failure.
 */
export async function setCover(supabase: SupabaseClient, id: string, coverUrl: string): Promise<{ ok: true; previous: string | null } | { ok: false; reason: string }> {
  const before = await readSnapshot(supabase, id);
  if (!before) return { ok: false, reason: "อ่านข้อมูลสื่อไม่สำเร็จ" };
  const saved = await supabase.rpc("admin_save_resource", saveParamsWithCover(id, before, coverUrl));
  if (saved.error) return { ok: false, reason: `บันทึกไม่สำเร็จ: ${saved.error.message}` };
  const after = await readSnapshot(supabase, id);
  if (after && after.cover_image_url === coverUrl && sameExceptCover(before, after)) return { ok: true, previous: before.cover_image_url };
  await supabase.rpc("admin_save_resource", saveParamsWithCover(id, before, before.cover_image_url ?? ""));
  return { ok: false, reason: "ตรวจพบว่าข้อมูลอื่นของสื่อเปลี่ยนไป จึงย้อนคืนค่าเดิมแล้ว" };
}

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Admin tool "บีบอัดรูปปกเดิม": re-saves big existing covers as small WebP files. Originals are never deleted. */
export function AdminCoverCompressPanel({ supabase }: { supabase: SupabaseClient }) {
  const [candidates, setCandidates] = useState<CompressionCandidate[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; title: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [backupRows, setBackupRows] = useState<{ id: string; url: string }[]>([]);
  const stopRef = useRef(false);
  const busy = scanning || running;

  const scan = async () => {
    setScanning(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.from("resources").select("id, title, cover_image_url").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as CoverRow[];
      const folders = [...new Set(rows.map((r) => coverObjectPath(r.cover_image_url)).filter((p): p is string => Boolean(p)).map((p) => p.split("/").slice(0, -1).join("/")))];
      const sizes = new Map<string, number>();
      for (const folder of folders) {
        const listed = await supabase.storage.from(COVER_BUCKET).list(folder, { limit: 1000 });
        if (listed.error) throw new Error(listed.error.message);
        for (const item of listed.data ?? []) {
          const size = (item.metadata as { size?: number } | null)?.size;
          if (typeof size === "number") sizes.set(folder ? `${folder}/${item.name}` : item.name, size);
        }
      }
      setCandidates(planCompression(rows, sizes));
      setOutcomes([]);
    } catch (thrown) {
      setMessage({ tone: "error", text: `ตรวจรายการไม่สำเร็จ: ${thrown instanceof Error ? thrown.message : String(thrown)}` });
    } finally {
      setScanning(false);
    }
  };

  const start = async () => {
    if (!candidates || candidates.length === 0) return;
    // 1. The backup file comes first, before anything is uploaded or changed.
    downloadText(`cover-backup-${new Date().toISOString().slice(0, 10)}.csv`, backupCsv(candidates.map((c) => ({ id: c.id, title: c.title, url: c.url }))));
    setRunning(true);
    stopRef.current = false;
    setOutcomes([]);
    setMessage(null);
    const results: Outcome[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      if (stopRef.current) break;
      const c = candidates[index];
      setProgress({ index: index + 1, total: candidates.length, title: c.title });
      let outcome: Outcome;
      try {
        const response = await fetch(c.url);
        if (!response.ok) throw new Error(`โหลดรูปเดิมไม่ได้ (${response.status})`);
        const original = await response.blob();
        const small = await compressToWebp(new File([original], coverFileName(c.url), { type: original.type || "image/png" }), COVER_COMPRESS_MAX_WIDTH, COVER_COMPRESS_QUALITY);
        if (small.size >= c.bytes * 0.9) {
          outcome = { id: c.id, title: c.title, status: "skipped", note: "ไม่คุ้ม (ไฟล์ใหม่ไม่เล็กลงพอ) ข้ามไป" };
        } else {
          const path = newCompressedPath(crypto.randomUUID());
          const uploaded = await supabase.storage.from(COVER_BUCKET).upload(path, small, { upsert: false, contentType: "image/webp", cacheControl: COVER_CACHE_CONTROL });
          if (uploaded.error) throw new Error(`อัปโหลดไม่สำเร็จ: ${uploaded.error.message}`);
          const newUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
          const changed = await setCover(supabase, c.id, newUrl);
          outcome = changed.ok
            ? { id: c.id, title: c.title, status: "done", note: `${formatKb(c.bytes)} → ${formatKb(small.size)}`, oldUrl: changed.previous ?? c.url, newUrl, saved: c.bytes - small.size }
            : { id: c.id, title: c.title, status: "failed", note: changed.reason };
        }
      } catch (thrown) {
        outcome = { id: c.id, title: c.title, status: "failed", note: thrown instanceof Error ? thrown.message : String(thrown) };
      }
      results.push(outcome);
      setOutcomes([...results]);
    }
    const refreshed = results.some((r) => r.status === "done") ? await refreshPublicPages() : true;
    const done = results.filter((r) => r.status === "done");
    const saved = done.reduce((sum, r) => sum + (r.saved ?? 0), 0);
    setMessage({
      tone: results.some((r) => r.status === "failed") ? "error" : "ok",
      text: `สรุป: สำเร็จ ${done.length} · ข้าม ${results.filter((r) => r.status === "skipped").length} · พลาด ${results.filter((r) => r.status === "failed").length} · ประหยัดต่อการโหลดหนึ่งรอบ ${formatKb(saved)}${stopRef.current ? " · หยุดกลางคัน" : ""}${refreshed ? "" : " · ล้างแคชหน้าเว็บไม่สำเร็จ หน้าเว็บจะอัปเดตภายใน 5 นาที"}`,
    });
    setProgress(null);
    setRunning(false);
    setCandidates(null);
  };

  const rollback = async (rows: { id: string; url: string }[]) => {
    if (rows.length === 0) return;
    setRunning(true);
    setMessage(null);
    const results: Outcome[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      setProgress({ index: index + 1, total: rows.length, title: row.id });
      try {
        const current = await readSnapshot(supabase, row.id);
        if (!current) results.push({ id: row.id, title: row.id, status: "failed", note: "อ่านข้อมูลสื่อไม่สำเร็จ" });
        else if (!isCompressedCoverUrl(current.cover_image_url)) results.push({ id: row.id, title: current.title, status: "skipped", note: "ปกไม่ได้ถูกบีบอัดโดยเครื่องมือนี้ ไม่แตะ" });
        else {
          const changed = await setCover(supabase, row.id, row.url);
          results.push({ id: row.id, title: current.title, status: changed.ok ? "done" : "failed", note: changed.ok ? "คืนลิงก์เดิมแล้ว" : changed.reason });
        }
      } catch (thrown) {
        results.push({ id: row.id, title: row.id, status: "failed", note: thrown instanceof Error ? thrown.message : String(thrown) });
      }
      setOutcomes([...results]);
    }
    const refreshed = await refreshPublicPages();
    setMessage({
      tone: results.some((r) => r.status === "failed") ? "error" : "ok",
      text: `ย้อนกลับ: คืนแล้ว ${results.filter((r) => r.status === "done").length} · ข้าม ${results.filter((r) => r.status === "skipped").length} · พลาด ${results.filter((r) => r.status === "failed").length} (ไฟล์เดิมไม่ถูกลบ)${refreshed ? "" : " · ล้างแคชไม่สำเร็จ หน้าเว็บจะอัปเดตภายใน 5 นาที"}`,
    });
    setProgress(null);
    setRunning(false);
  };

  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackupCsv(await file.text());
    setBackupRows(parsed.rows);
    setMessage(parsed.rows.length === 0
      ? { tone: "error", text: "ไฟล์สำรองนี้ไม่มีรายการที่ใช้ได้" }
      : { tone: "ok", text: `อ่านไฟล์สำรองแล้ว ${parsed.rows.length} รายการ${parsed.rejected ? ` (ข้ามบรรทัดที่ไม่ถูกต้อง ${parsed.rejected})` : ""}` });
  };

  const sessionChanges = outcomes.filter((o) => o.status === "done" && o.oldUrl).map((o) => ({ id: o.id, url: o.oldUrl as string }));
  const sum = candidates ? totals(candidates) : null;

  return (
    <section className="kru-card" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-6)", display: "grid", gap: "var(--sp-4)" }} aria-labelledby="admin-cover-compress-title">
      <div>
        <h2 id="admin-cover-compress-title" style={{ fontSize: "var(--fs-20)" }}>บีบอัดรูปปกเดิม</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-14)" }}>
          ลดโควตา Supabase โดยย่อรูปปกที่ใหญ่เกิน 150 KB เป็น WebP กว้างไม่เกิน {COVER_COMPRESS_MAX_WIDTH}px ไฟล์ใหม่อยู่ในโฟลเดอร์ v2/ (แคช 1 ปี) ไฟล์เดิมไม่ถูกลบ ·
          ก่อนเริ่มระบบดาวน์โหลดไฟล์สำรอง (CSV) ให้อัตโนมัติ · ใช้สิทธิ์แอดมินที่ล็อกอินอยู่ ไม่ใช้กุญแจลับ · ใช้ทีละเครื่อง อย่าปิดหน้านี้ระหว่างทำ
        </p>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => void scan()} loading={scanning} disabled={running}>ตรวจรายการรูปที่ควรบีบอัด</Button>
      </div>

      {candidates && (
        candidates.length === 0 ? (
          <p role="status">ไม่มีรูปปกที่ต้องบีบอัดแล้ว</p>
        ) : (
          <>
            <p role="status">
              พบ {sum?.count} รูป · รวม {formatKb(sum?.before ?? 0)} · คาดว่าเหลือประมาณ {formatKb(sum?.after ?? 0)} (ตัวเลขคาดการณ์ ผลจริงอาจต่างกัน)
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-13)" }}>
                <thead><tr><th align="left">สื่อ</th><th align="left">ไฟล์เดิม</th><th align="right">เดิม</th><th align="right">คาดว่าเหลือ</th></tr></thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{coverFileName(c.url)}</td>
                      <td align="right">{formatKb(c.bytes)}</td>
                      <td align="right">≈ {formatKb(c.estimatedAfterBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <Button onClick={() => void start()} disabled={busy}>ดาวน์โหลดไฟล์สำรอง แล้วเริ่มบีบอัด {sum?.count} รูป</Button>
            </div>
          </>
        )
      )}

      {progress && (
        <div role="status" aria-live="polite">
          กำลังทำรูปที่ {progress.index}/{progress.total}: {progress.title}
          {running && <Button size="sm" variant="secondary" style={{ marginLeft: "var(--sp-3)" }} onClick={() => { stopRef.current = true; }}>หยุดหลังรูปนี้</Button>}
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} style={{ color: message.tone === "error" ? "var(--status-danger-fg)" : "var(--status-success-fg)" }}>{message.text}</p>
      )}

      {outcomes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "var(--sp-5)", fontSize: "var(--fs-13)" }}>
          {outcomes.map((o) => (
            <li key={o.id}>{o.status === "done" ? "✅" : o.status === "skipped" ? "⏭️" : "❌"} {o.title} — {o.note}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "grid", gap: "var(--sp-3)", borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--sp-4)" }}>
        <strong>ย้อนกลับ</strong>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>คืนลิงก์ปกเดิมจากรายการสำรอง (ไฟล์เดิมยังอยู่ ไม่มีอะไรถูกลบ) จะคืนเฉพาะสื่อที่ปกตอนนี้อยู่ใน v2/</p>
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "center" }}>
          {sessionChanges.length > 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => void rollback(sessionChanges)}>ย้อนกลับรอบนี้ ({sessionChanges.length} รายการ)</Button>
          )}
          <label htmlFor="cover-backup-file">หรือเลือกไฟล์สำรอง (CSV)</label>
          <input id="cover-backup-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { void readBackup(event.target.files?.[0]); event.target.value = ""; }} />
          {backupRows.length > 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => void rollback(backupRows)}>ย้อนกลับตามไฟล์สำรอง ({backupRows.length} รายการ)</Button>
          )}
        </div>
      </div>
    </section>
  );
}
