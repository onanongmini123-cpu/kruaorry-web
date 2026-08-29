// Shared rules for the private resource-file upload feature: file
// validation, per-delivery-mode publish requirements, upload-strategy
// selection, fail-closed publish guarding, and retryable storage cleanup.
// Kept framework-free so it can be unit tested without a browser, without
// tus-js-client's XHR/Blob runtime, and without a live Supabase project.

export const RESOURCE_FILE_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

export const RESOURCE_FILE_MAX_BYTES = 50 * 1024 * 1024;

export function validateResourceFile(file: { type: string; size: number }): string | null {
  if (!RESOURCE_FILE_MIME_EXTENSIONS[file.type]) {
    return "รองรับเฉพาะไฟล์ PDF, DOCX, PPTX, XLSX และ ZIP เท่านั้น";
  }
  if (file.size > RESOURCE_FILE_MAX_BYTES) {
    return "ไฟล์ต้องมีขนาดไม่เกิน 50MB";
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

// Supabase's TUS chunk size is fixed at 6MB by their docs, and files at or
// under that size upload reliably with the plain (non-resumable) upload
// call — so that's also the cutover point between the two strategies.
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

export type UploadStrategy = "standard" | "resumable";

export function chooseUploadStrategy(fileSize: number): UploadStrategy {
  return fileSize > RESUMABLE_UPLOAD_THRESHOLD_BYTES ? "resumable" : "standard";
}

// Supabase's resumable/TUS uploads must go to the project's direct storage
// hostname (<ref>.storage.supabase.co), not the regular API hostname the
// rest of the app talks to — derived here so the caller only needs the
// normal NEXT_PUBLIC_SUPABASE_URL.
export function resumableUploadEndpoint(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export type DeliveryMode = "web_app" | "google_template" | "google_form" | "file_download";

export interface PublishCandidate {
  status: "draft" | "published" | "archived";
  deliveryMode: DeliveryMode;
  coverImageUrl: string | null;
  filePath: string | null;
  ctaUrl: string | null;
}

// Mirrors the DB CHECK constraints added for this feature (see
// supabase/migrations/20260829120000_015_resource_type_publish_targets.sql)
// so the admin UI can reject an invalid publish — including editing an
// already-published resource into an invalid state — with a specific
// reason, instead of surfacing a raw Postgres constraint error or (worse)
// letting the DB be the only thing standing in the way.
export function publishValidationError(candidate: PublishCandidate): string | null {
  if (candidate.status !== "published") return null;
  if (!candidate.coverImageUrl) return "ต้องมีรูปปกก่อนเผยแพร่";
  if (candidate.deliveryMode === "file_download") {
    return candidate.filePath ? null : "โหมดไฟล์ดาวน์โหลดต้องมีไฟล์แนบก่อนเผยแพร่";
  }
  return candidate.ctaUrl ? null : "โหมดนี้ต้องมีลิงก์ปลายทาง (URL) ก่อนเผยแพร่";
}

export interface PublishGuardOutcome {
  data: PublishCandidate | null;
  error: { message: string } | null;
}

export interface PublishGuardResult {
  allow: boolean;
  reason: string | null;
}

// Gate used right before flipping a resource to "published": if the
// pre-publish lookup itself errored, or came back with no row, this fails
// closed (never allow) instead of treating an unreadable result as "no
// problems found" and publishing anyway.
export function evaluatePublishGuard(outcome: PublishGuardOutcome): PublishGuardResult {
  if (outcome.error) return { allow: false, reason: `ตรวจสอบข้อมูลก่อนเผยแพร่ไม่สำเร็จ: ${outcome.error.message}` };
  if (!outcome.data) return { allow: false, reason: "ไม่พบข้อมูลสื่อนี้ ไม่สามารถเผยแพร่ได้" };
  const reason = publishValidationError(outcome.data);
  return reason ? { allow: false, reason } : { allow: true, reason: null };
}

export interface PendingFile {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface ResourceFileFields {
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime_type: string | null;
}

// Given the currently-saved file and the form's in-progress edits (a
// freshly uploaded pending file, and/or a not-yet-committed removal),
// computes what should actually be persisted to the resources row.
export function nextResourceFileFields(current: ResourceFileFields, pendingFile: PendingFile | null, fileRemoved: boolean): ResourceFileFields {
  if (pendingFile) {
    return { file_path: pendingFile.path, file_name: pendingFile.name, file_size: pendingFile.size, file_mime_type: pendingFile.mimeType };
  }
  if (fileRemoved) {
    return { file_path: null, file_name: null, file_size: null, file_mime_type: null };
  }
  return current;
}

export interface StorageRemover {
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export interface CleanupFailure {
  path: string;
  message: string;
}

// Attempts to delete a single storage object, never throwing — a failure
// comes back as a { path, message } record instead of being swallowed, so
// the caller can hold onto it (e.g. in component state) and offer a retry
// rather than losing track of an orphaned file after one failed attempt.
async function removeStorageObject(storage: StorageRemover, path: string): Promise<CleanupFailure | null> {
  const { error } = await storage.remove([path]);
  return error ? { path, message: error.message } : null;
}

// Retries deleting a batch of previously-failed paths. Paths that succeed
// this time are dropped; paths that still fail are returned so the caller
// can keep exactly those (and only those) around for a further retry.
export async function retryCleanup(storage: StorageRemover, paths: string[]): Promise<{ succeeded: string[]; failed: CleanupFailure[] }> {
  const succeeded: string[] = [];
  const failed: CleanupFailure[] = [];
  for (const path of paths) {
    const failure = await removeStorageObject(storage, path);
    if (failure) failed.push(failure);
    else succeeded.push(path);
  }
  return { succeeded, failed };
}

export interface CommitFileChangeArgs {
  storage: StorageRemover;
  saveRow: () => Promise<{ error: { message: string } | null }>;
  currentFilePath: string | null;
  pendingFile: PendingFile | null;
  fileRemoved: boolean;
}

export interface CommitFileChangeResult {
  ok: boolean;
  saveError: string | null;
  cleanupFailures: CleanupFailure[];
}

// Orchestrates the required order of operations for a file add/replace/remove:
//   1. (caller has already uploaded the new file, passed in as `pendingFile`)
//   2. save the row
//   3. only on success, delete the file that's no longer referenced
//   4. on failure, delete the just-uploaded pending file and leave the
//      previously-saved file (and row) untouched
// Any cleanup failure is returned as a CleanupFailure rather than being
// logged and dropped, so the caller can retain it for retryCleanup.
export async function commitResourceFileChange({ storage, saveRow, currentFilePath, pendingFile, fileRemoved }: CommitFileChangeArgs): Promise<CommitFileChangeResult> {
  const { error: saveError } = await saveRow();
  const cleanupFailures: CleanupFailure[] = [];

  if (saveError) {
    if (pendingFile) {
      const failure = await removeStorageObject(storage, pendingFile.path);
      if (failure) cleanupFailures.push(failure);
    }
    return { ok: false, saveError: saveError.message, cleanupFailures };
  }

  const oldPathToDelete = pendingFile || fileRemoved ? currentFilePath : null;
  if (oldPathToDelete) {
    const failure = await removeStorageObject(storage, oldPathToDelete);
    if (failure) cleanupFailures.push(failure);
  }
  return { ok: true, saveError: null, cleanupFailures };
}

export interface BusyGuardResult {
  allowed: boolean;
  message: string | null;
}

// Single gate used everywhere an admin action must not be allowed to
// interrupt an in-flight save/upload: closing or cancelling the form,
// submitting the form again, opening a different resource to edit,
// switching admin console views, deleting or changing the status of any
// resource, and signing out. `saving` is the one flag that stays true for
// the entire upload + row-save + cleanup sequence.
export function guardAgainstBusyForm(saving: boolean): BusyGuardResult {
  return saving ? { allowed: false, message: "กำลังบันทึก/อัปโหลดไฟล์อยู่ กรุณารอให้เสร็จก่อน" } : { allowed: true, message: null };
}
