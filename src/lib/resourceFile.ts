// Shared rules for the private resource-file upload feature: file
// validation, per-delivery-mode publish requirements, upload-strategy
// selection, the TUS resumable-upload orchestration, fail-closed publish
// guarding, and retryable storage cleanup. Kept framework-free (the TUS
// uploader factory is injected) so all of it can be unit tested without a
// browser, without tus-js-client's real XHR/Blob runtime, and without a
// live Supabase project.

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

// Same fail-closed principle for a lookup that gates a destructive action:
// if the file_path lookup before deleting a resource errored, the delete
// must not proceed at all (not even the row delete), since we'd otherwise
// have no way of knowing whether an attached file needs cleanup.
export function canProceedAfterFileLookup(error: { message: string } | null): boolean {
  return error === null;
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

export interface StorageObject {
  storage: StorageRemover;
  path: string;
}

export interface CleanupFailure {
  path: string;
  message: string;
  storage: StorageRemover;
}

// Attempts to delete a single storage object. Catches a *thrown* exception
// (e.g. a network failure before storage.remove() even resolves) as well
// as a returned {error} — either way it never throws, and never drops the
// failure: it comes back as a CleanupFailure the caller can hold onto
// (e.g. in component state) and retry, instead of losing track of an
// orphaned file after one failed attempt.
async function removeStorageObject(storage: StorageRemover, path: string): Promise<CleanupFailure | null> {
  try {
    const { error } = await storage.remove([path]);
    return error ? { path, message: error.message, storage } : null;
  } catch (thrown) {
    return { path, message: thrown instanceof Error ? thrown.message : String(thrown), storage };
  }
}

// Retries deleting a batch of previously-failed storage objects (possibly
// across different buckets — each carries its own `storage` handle).
// Objects that succeed this time are dropped; objects that still fail are
// returned so the caller can keep exactly those around for a further retry.
export async function retryCleanup(items: StorageObject[]): Promise<{ succeeded: string[]; failed: CleanupFailure[] }> {
  const succeeded: string[] = [];
  const failed: CleanupFailure[] = [];
  for (const item of items) {
    const failure = await removeStorageObject(item.storage, item.path);
    if (failure) failed.push(failure);
    else succeeded.push(item.path);
  }
  return { succeeded, failed };
}

export interface CommitFileChangeArgs {
  saveRow: () => Promise<{ error: { message: string } | null }>;
  // Newly uploaded objects this save would reference (a new/replacement
  // resource file, a newly uploaded cover) — deleted if the save fails or
  // throws, so nothing orphaned gets left behind by a failed save.
  pendingUploads: StorageObject[];
  // Objects to delete only once the save has actually succeeded (e.g. the
  // resource file being replaced or removed).
  obsoleteOnSuccess: StorageObject[];
}

export interface CommitFileChangeResult {
  ok: boolean;
  saveError: string | null;
  cleanupFailures: CleanupFailure[];
}

// Orchestrates the required order of operations for a file add/replace/remove:
//   1. (caller has already uploaded any new files, passed as pendingUploads)
//   2. save the row
//   3. only on success, delete whatever is now obsolete
//   4. on failure — including saveRow() *throwing* rather than resolving
//      with {error} — delete every pending upload and leave anything
//      already-saved untouched
// Any cleanup failure is returned as a CleanupFailure rather than being
// logged and dropped, so the caller can retain it for retryCleanup.
export async function commitResourceFileChange({ saveRow, pendingUploads, obsoleteOnSuccess }: CommitFileChangeArgs): Promise<CommitFileChangeResult> {
  let saveError: { message: string } | null;
  try {
    saveError = (await saveRow()).error;
  } catch (thrown) {
    saveError = { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }

  const cleanupFailures: CleanupFailure[] = [];

  if (saveError) {
    for (const item of pendingUploads) {
      const failure = await removeStorageObject(item.storage, item.path);
      if (failure) cleanupFailures.push(failure);
    }
    return { ok: false, saveError: saveError.message, cleanupFailures };
  }

  for (const item of obsoleteOnSuccess) {
    const failure = await removeStorageObject(item.storage, item.path);
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
// the entire upload + row-save + cleanup sequence (cover upload included).
export function guardAgainstBusyForm(saving: boolean): BusyGuardResult {
  return saving ? { allowed: false, message: "กำลังบันทึก/อัปโหลดไฟล์อยู่ กรุณารอให้เสร็จก่อน" } : { allowed: true, message: null };
}

// ---------------------------------------------------------------------
// TUS resumable upload
// ---------------------------------------------------------------------
// The tus.Upload constructor is injected as `createUpload` so this whole
// module stays testable without tus-js-client's real XHR/Blob runtime —
// the real implementation (admin/page.tsx) passes a thin wrapper around
// `new tus.Upload(...)`; tests pass a fake that exposes the same shape and
// lets the test trigger onProgress/onError/onSuccess directly.

export interface TusPreviousUpload {
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

export interface TusUploadOptions {
  endpoint: string;
  retryDelays: number[];
  headers: Record<string, string>;
  uploadDataDuringCreation: boolean;
  removeFingerprintOnSuccess: boolean;
  metadata: Record<string, string>;
  chunkSize: number;
  fingerprint: () => Promise<string>;
  onError: (error: Error) => void;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess: () => void;
}

export interface TusUploadHandle {
  start(): void;
  abort(shouldTerminate?: boolean): Promise<void>;
  findPreviousUploads(): Promise<TusPreviousUpload[]>;
  resumeFromPreviousUpload(previousUpload: TusPreviousUpload): void;
}

export type TusUploadFactory = (file: File, options: TusUploadOptions) => TusUploadHandle;

// Picks the one previous upload (if any) that actually matches this exact
// object path — never just previousUploads[0]. The custom fingerprint in
// runResumableUpload already scopes tus's own lookup to this bucket+path+
// file, but this is an explicit, independently-checked safety net so a
// fingerprint collision (or a stale/foreign entry) can never cause one
// resource's file to resume into a different resource's upload.
export function pickResumableUpload(previousUploads: TusPreviousUpload[], path: string): TusPreviousUpload | null {
  return previousUploads.find((u) => u.metadata?.objectName === path) ?? null;
}

export type ResumableUploadStatus = { phase: "uploading"; progress: number } | { phase: "paused" } | { phase: "error"; message: string };

export interface ResumableUploadResult {
  ok: boolean;
  file: PendingFile | null;
}

export interface ResumableUploadController {
  result: Promise<ResumableUploadResult>;
  // abort(false): stops sending data but keeps the upload session alive
  // server-side so it can be resumed — "pause", never a new path/fingerprint.
  // A failed abort() call is caught and returned (never swallowed) so the
  // caller can surface it.
  pause: () => Promise<{ error: string | null }>;
  // abort(true): also terminates the upload server-side (deletes the
  // partial object) — a real cancel, after which the caller must treat
  // this file selection as abandoned (pick again for a fresh path). Always
  // finishes the result as { ok: false } even if the abort call itself
  // fails, since the attempt is being abandoned either way — but the
  // failure is still returned, never swallowed.
  cancel: () => Promise<{ error: string | null }>;
  // Re-runs the same upload attempt against the same file/path/fingerprint
  // — never generates a new object path.
  retry: () => void;
}

export interface RunResumableUploadArgs {
  createUpload: TusUploadFactory;
  file: File;
  path: string;
  bucketName: string;
  endpoint: string;
  headers: Record<string, string>;
  onStatusChange: (status: ResumableUploadStatus) => void;
}

// Drives one resumable upload end to end. The object path and the fields
// that feed the fingerprint (bucket, path, file identity) are fixed for
// the entire lifetime of the controller — every retry/resume/pause-then-
// resume reuses the exact same `attempt()` closure over `path`/`file`, so
// nothing here can ever mint a second path for the same selection.
export function runResumableUpload({ createUpload, file, path, bucketName, endpoint, headers, onStatusChange }: RunResumableUploadArgs): ResumableUploadController {
  let currentUpload: TusUploadHandle | null = null;
  let settled = false;
  let resolveResult!: (result: ResumableUploadResult) => void;
  const result = new Promise<ResumableUploadResult>((resolve) => {
    resolveResult = resolve;
  });

  const finish = (outcome: ResumableUploadResult) => {
    if (settled) return;
    settled = true;
    resolveResult(outcome);
  };

  // Ties resumability to this exact bucket + object path + file identity,
  // so tus's own findPreviousUploads() can never match a different
  // resource's file, or a different pick of the same file.
  const fingerprint = async () => `kruaorry:${bucketName}:${path}:${file.size}:${file.type}:${file.lastModified}`;

  const attempt = () => {
    const upload = createUpload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName, objectName: path, contentType: file.type, cacheControl: "3600" },
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      fingerprint,
      onError: (error) => {
        onStatusChange({ phase: "error", message: error.message });
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onStatusChange({ phase: "uploading", progress: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0 });
      },
      onSuccess: () => {
        finish({ ok: true, file: { path, name: file.name, size: file.size, mimeType: file.type } });
      },
    });
    currentUpload = upload;

    onStatusChange({ phase: "uploading", progress: 0 });

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        const match = pickResumableUpload(previousUploads, path);
        if (match) upload.resumeFromPreviousUpload(match);
        upload.start();
      })
      .catch((findError: unknown) => {
        onStatusChange({ phase: "error", message: findError instanceof Error ? findError.message : String(findError) });
      });
  };

  attempt();

  return {
    result,
    pause: async () => {
      if (!currentUpload) return { error: null };
      try {
        await currentUpload.abort(false);
        onStatusChange({ phase: "paused" });
        return { error: null };
      } catch (abortError) {
        const message = abortError instanceof Error ? abortError.message : String(abortError);
        // Stays actionable (retry/cancel) rather than being lost — the
        // upload session is still live, just not confirmed paused.
        onStatusChange({ phase: "error", message: `พักการอัปโหลดไม่สำเร็จ: ${message}` });
        return { error: message };
      }
    },
    cancel: async () => {
      let errorMessage: string | null = null;
      try {
        if (currentUpload) await currentUpload.abort(true);
      } catch (abortError) {
        errorMessage = abortError instanceof Error ? abortError.message : String(abortError);
      } finally {
        // The attempt is abandoned either way — a failed terminate call
        // doesn't leave the form stuck, but the failure is still returned
        // (never swallowed) so the caller can report it.
        finish({ ok: false, file: null });
      }
      return { error: errorMessage };
    },
    retry: () => {
      attempt();
    },
  };
}
