// Shared rules for the private resource-file upload feature: file
// validation, per-delivery-mode publish requirements, and the safe
// upload-then-save-then-cleanup sequencing used when an admin adds,
// replaces, or removes a file. Kept framework-free so it can be unit
// tested without a browser or a live Supabase project.

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
// so the admin UI can reject an invalid publish with a specific reason
// instead of surfacing a raw Postgres constraint error.
export function publishValidationError(candidate: PublishCandidate): string | null {
  if (candidate.status !== "published") return null;
  if (!candidate.coverImageUrl) return "ต้องมีรูปปกก่อนเผยแพร่";
  if (candidate.deliveryMode === "file_download") {
    return candidate.filePath ? null : "โหมดไฟล์ดาวน์โหลดต้องมีไฟล์แนบก่อนเผยแพร่";
  }
  return candidate.ctaUrl ? null : "โหมดนี้ต้องมีลิงก์ปลายทาง (URL) ก่อนเผยแพร่";
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
  cleanupErrors: string[];
}

// Orchestrates the required order of operations for a file add/replace/remove:
//   1. (caller has already uploaded the new file, passed in as `pendingFile`)
//   2. save the row
//   3. only on success, delete the file that's no longer referenced
//   4. on failure, delete the just-uploaded pending file and leave the
//      previously-saved file (and row) untouched
// Every cleanup attempt's result is reported back via `cleanupErrors`
// rather than being silently swallowed.
export async function commitResourceFileChange({ storage, saveRow, currentFilePath, pendingFile, fileRemoved }: CommitFileChangeArgs): Promise<CommitFileChangeResult> {
  const { error: saveError } = await saveRow();
  const cleanupErrors: string[] = [];

  if (saveError) {
    if (pendingFile) {
      const { error } = await storage.remove([pendingFile.path]);
      if (error) cleanupErrors.push(`ลบไฟล์ที่อัปโหลดค้างไว้ไม่สำเร็จหลังบันทึกล้มเหลว: ${error.message}`);
    }
    return { ok: false, saveError: saveError.message, cleanupErrors };
  }

  const oldPathToDelete = pendingFile || fileRemoved ? currentFilePath : null;
  if (oldPathToDelete) {
    const { error } = await storage.remove([oldPathToDelete]);
    if (error) cleanupErrors.push(`บันทึกสำเร็จ แต่ลบไฟล์เดิมไม่สำเร็จ: ${error.message}`);
  }
  return { ok: true, saveError: null, cleanupErrors };
}

// Deletes an uploaded-but-never-saved file: used both when the admin
// explicitly removes a freshly picked file before saving, and when the
// whole form is closed/cancelled with a pending upload still sitting in
// storage. Returns an error message on failure instead of throwing, so
// call sites can report it without an extra try/catch.
export async function discardPendingUpload(storage: StorageRemover, pendingFile: PendingFile | null): Promise<string | null> {
  if (!pendingFile) return null;
  const { error } = await storage.remove([pendingFile.path]);
  return error ? `ลบไฟล์ที่อัปโหลดค้างไว้ไม่สำเร็จ: ${error.message}` : null;
}
