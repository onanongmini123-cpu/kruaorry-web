"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flag, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMyResourceReview,
  fetchMyResourceReview,
  fetchResourceReviews,
  submitResourceIssue,
  upsertMyResourceReview,
  type ResourceIssueCategory,
  type ResourceReview,
} from "@/lib/data";

const REPORT_OPTIONS: Array<{ value: ResourceIssueCategory; label: string }> = [
  { value: "cannot_open", label: "เปิดสื่อไม่ได้" },
  { value: "broken_link", label: "ลิงก์เสีย" },
  { value: "cannot_download", label: "ดาวน์โหลดไม่ได้" },
  { value: "wrong_content", label: "เนื้อหาไม่ตรง" },
  { value: "other", label: "อื่น ๆ" },
];

type Props = {
  resourceId: string;
  authenticated: boolean;
  canInteract: boolean;
  initialAverage?: number | null;
  initialCount?: number;
};

export function ResourceFeedback({
  resourceId,
  authenticated,
  canInteract,
  initialAverage = null,
  initialCount = 0,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [reviews, setReviews] = useState<ResourceReview[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [hasOwnReview, setHasOwnReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ResourceIssueCategory>("cannot_open");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);
  const canSubmitFeedback = authenticated && canInteract;

  const fetchSnapshot = useCallback(async () => {
    const rows = await fetchResourceReviews(supabase, resourceId);
    const ownReview = canSubmitFeedback
      ? await fetchMyResourceReview(supabase, resourceId)
      : null;
    return { rows, ownReview };
  }, [canSubmitFeedback, resourceId, supabase]);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof fetchSnapshot>>) => {
    setReviews(snapshot.rows);
    if (snapshot.ownReview) {
      setRating(snapshot.ownReview.rating);
      setBody(snapshot.ownReview.body);
      setHasOwnReview(true);
    } else {
      setHasOwnReview(false);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(async () => {
    applySnapshot(await fetchSnapshot());
  }, [applySnapshot, fetchSnapshot]);

  useEffect(() => {
    let active = true;
    void fetchSnapshot().then((snapshot) => {
      if (active) applySnapshot(snapshot);
    });
    return () => { active = false; };
  }, [applySnapshot, fetchSnapshot]);

  // The catalog summary is database-derived across every visible review.
  // The list below is intentionally capped to the latest 20, so deriving the
  // headline from the rendered slice would under-count popular resources.
  const calculatedCount = initialCount;
  const calculatedAverage = initialAverage;

  const saveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length < 3 || trimmed.length > 1000) {
      setError("รีวิวต้องมี 3–1,000 ตัวอักษร");
      return;
    }
    setSaving(true);
    const saveError = await upsertMyResourceReview(supabase, resourceId, rating, trimmed);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setHasOwnReview(true);
    setMessage("บันทึกรีวิวแล้ว และส่งให้ทีมงานตรวจสอบก่อนเผยแพร่");
    await reload();
  };

  const deleteReview = async () => {
    if (!window.confirm("ต้องการลบรีวิวของคุณใช่ไหม")) return;
    setSaving(true);
    setError(null);
    const deleteError = await deleteMyResourceReview(supabase, resourceId);
    setSaving(false);
    if (deleteError) return setError(deleteError);
    setHasOwnReview(false);
    setRating(5);
    setBody("");
    setMessage("ลบรีวิวแล้ว");
    await reload();
  };

  const sendReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const trimmed = reportDetails.trim();
    if (trimmed.length < 5 || trimmed.length > 1000) {
      setError("กรุณาอธิบายปัญหา 5–1,000 ตัวอักษร");
      return;
    }
    setReporting(true);
    const reportError = await submitResourceIssue(supabase, resourceId, reportCategory, trimmed);
    setReporting(false);
    if (reportError) return setError(reportError);
    setReportDetails("");
    setReportOpen(false);
    setMessage("ส่งรายงานให้แอดมินแล้ว ขอบคุณที่ช่วยแจ้งปัญหาค่ะ");
  };

  return (
    <section className="kru-feedback" aria-labelledby={`reviews-${resourceId}`}>
      <div className="kru-feedback__heading">
        <div>
          <h2 id={`reviews-${resourceId}`}>รีวิวจากสมาชิก</h2>
          <p>{calculatedAverage === null ? "ยังไม่มีคะแนน" : `${calculatedAverage.toFixed(1)} จาก 5 · ${calculatedCount} รีวิว`}</p>
        </div>
        {canSubmitFeedback && (
          <Button type="button" variant="ghost" icon={Flag} onClick={() => setReportOpen((open) => !open)} aria-expanded={reportOpen}>
            รายงานปัญหา
          </Button>
        )}
      </div>

      {reportOpen && canSubmitFeedback && (
        <form className="kru-feedback__report" onSubmit={sendReport}>
          <div className="kru-feedback__report-title"><AlertTriangle size={18} aria-hidden="true" /> แจ้งปัญหาเกี่ยวกับสื่อนี้</div>
          <label>ประเภทปัญหา
            <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as ResourceIssueCategory)}>
              {REPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>รายละเอียด
            <textarea value={reportDetails} maxLength={1000} rows={4} onChange={(event) => setReportDetails(event.target.value)} placeholder="บอกอาการที่พบ เพื่อให้ทีมงานตรวจสอบได้เร็วขึ้น" />
          </label>
          <div className="kru-feedback__actions">
            <Button type="submit" loading={reporting}>ส่งรายงาน</Button>
            <Button type="button" variant="ghost" onClick={() => setReportOpen(false)}>ยกเลิก</Button>
          </div>
        </form>
      )}

      {canSubmitFeedback ? (
        <form className="kru-feedback__form" onSubmit={saveReview}>
          <fieldset>
            <legend>{hasOwnReview ? "แก้ไขคะแนนของคุณ" : "ให้คะแนนสื่อนี้"}</legend>
            <div className="kru-feedback__stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} title={`${value} ดาว`}>
                  <input type="radio" name={`rating-${resourceId}`} value={value} checked={rating === value} onChange={() => setRating(value)} />
                  <Star size={28} fill={rating >= value ? "currentColor" : "none"} aria-hidden="true" />
                  <span className="kru-visually-hidden">{value} ดาว</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>รีวิวของคุณ
            <textarea value={body} maxLength={1000} rows={4} onChange={(event) => setBody(event.target.value)} placeholder="สื่อนี้ช่วยในการสอนอย่างไร" />
          </label>
          <div className="kru-feedback__actions">
            <Button type="submit" loading={saving}>{hasOwnReview ? "บันทึกการแก้ไข" : "ส่งรีวิว"}</Button>
            {hasOwnReview && <Button type="button" variant="ghost" icon={Trash2} disabled={saving} onClick={() => void deleteReview()}>ลบรีวิว</Button>}
          </div>
        </form>
      ) : !authenticated ? (
        <p className="kru-feedback__notice">เข้าสู่ระบบและมีสิทธิ์ใช้สื่อนี้ก่อน จึงจะให้คะแนนหรือรายงานปัญหาได้</p>
      ) : (
        <p className="kru-feedback__notice">บัญชีของคุณยังไม่มีสิทธิ์ใช้สื่อนี้ จึงยังเขียนรีวิวไม่ได้</p>
      )}

      <p className="kru-feedback__context">
        รีวิวที่ผ่านการดูแลจะแสดงต่อสาธารณะในชื่อกลาง “สมาชิก KruAorry” โดยไม่เปิดเผยชื่อหรือรูปโปรไฟล์ ส่วนการเขียนรีวิวและรายงานปัญหาสงวนไว้สำหรับสมาชิกที่เข้าสู่ระบบและมีสิทธิ์ใช้สื่อนี้
      </p>

      {error && <p role="alert" className="kru-feedback__error">{error}</p>}
      {message && <p role="status" className="kru-feedback__success">{message}</p>}

      <div className="kru-feedback__list" aria-busy={loading}>
        {loading ? <p>กำลังโหลดรีวิว...</p> : reviews.length === 0 ? (
          <p>ยังไม่มีรีวิว เป็นคนแรกที่แชร์ประสบการณ์ใช้สื่อนี้ได้เลย</p>
        ) : reviews.map((review) => (
          <article key={review.id} className="kru-feedback__review">
            <ProfileAvatar supabase={supabase} avatarPath={review.reviewerAvatarPath} name={review.reviewerName} size={42} />
            <div>
              <div className="kru-feedback__review-meta"><strong>{review.reviewerName}</strong><span aria-label={`${review.rating} ดาว`}>{"★".repeat(review.rating)}<span aria-hidden="true" className="kru-feedback__empty-stars">{"★".repeat(5 - review.rating)}</span></span></div>
              <p>{review.body}</p>
            </div>
          </article>
        ))}
      </div>
      {!loading && initialCount > reviews.length && (
        <p className="kru-feedback__context">แสดง {reviews.length} รีวิวล่าสุด จากทั้งหมด {initialCount} รีวิว</p>
      )}

      <style jsx>{`
        .kru-feedback { margin-top: var(--sp-10); display: grid; gap: var(--sp-6); }
        .kru-feedback__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
        .kru-feedback__heading h2 { font-size: var(--fs-24); }
        .kru-feedback__heading p { margin-top: 4px; color: var(--text-muted); }
        .kru-feedback__form, .kru-feedback__report { padding: var(--sp-6); display: grid; gap: var(--sp-5); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); }
        .kru-feedback__report { background: var(--status-warning-bg); }
        .kru-feedback__report-title { display: flex; align-items: center; gap: 8px; font-weight: var(--fw-semibold); }
        fieldset { margin: 0; padding: 0; border: 0; }
        legend, label { display: grid; gap: 7px; color: var(--text-body); font-size: var(--fs-14); font-weight: var(--fw-semibold); }
        textarea, select { width: 100%; min-height: 48px; padding: 12px 14px; border: 1px solid var(--border-default); border-radius: var(--r-md); background: var(--white); color: var(--text-strong); font: inherit; font-weight: var(--fw-regular); resize: vertical; }
        textarea:focus, select:focus { outline: 0; box-shadow: var(--ring-focus); }
        .kru-feedback__stars { margin-top: 9px; display: flex; gap: 2px; color: #d28a00; }
        .kru-feedback__stars label { width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; }
        .kru-feedback__stars input { position: absolute; opacity: 0; }
        .kru-feedback__stars label:has(input:focus-visible) { border-radius: var(--r-pill); box-shadow: var(--ring-focus); }
        .kru-feedback__actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-feedback__notice, .kru-feedback__list > p { padding: var(--sp-5); border-radius: var(--r-md); background: var(--surface-sunken); color: var(--text-muted); }
        .kru-feedback__context { color: var(--text-muted); font-size: var(--fs-14); line-height: 1.65; }
        .kru-feedback__error, .kru-feedback__success { padding: var(--sp-4); border-radius: var(--r-md); }
        .kru-feedback__error { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-feedback__success { background: var(--status-success-bg); color: var(--status-success-fg); }
        .kru-feedback__list { display: grid; gap: var(--sp-4); }
        .kru-feedback__review { padding: var(--sp-5); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); }
        .kru-feedback__review-meta { display: flex; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; color: #b56f00; }
        .kru-feedback__review-meta strong { color: var(--text-strong); }
        .kru-feedback__review p { margin-top: var(--sp-2); color: var(--text-body); white-space: pre-wrap; overflow-wrap: anywhere; }
        .kru-feedback__empty-stars { color: var(--border-default); }
        .kru-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (max-width: 560px) {
          .kru-feedback__heading :global(.kru-btn) { width: 100%; }
          .kru-feedback__actions :global(.kru-btn) { flex: 1 1 160px; }
        }
      `}</style>
    </section>
  );
}
