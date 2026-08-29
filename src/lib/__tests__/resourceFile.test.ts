import { describe, expect, it, vi } from "vitest";
import {
  validateResourceFile,
  publishValidationError,
  nextResourceFileFields,
  commitResourceFileChange,
  discardPendingUpload,
  RESOURCE_FILE_MAX_BYTES,
  type StorageRemover,
  type PendingFile,
} from "../resourceFile";

describe("validateResourceFile", () => {
  it("accepts every supported MIME type under the size limit", () => {
    const supported = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ];
    for (const type of supported) {
      expect(validateResourceFile({ type, size: 1024 })).toBeNull();
    }
  });

  it("rejects a disallowed MIME type", () => {
    expect(validateResourceFile({ type: "image/png", size: 1024 })).not.toBeNull();
    expect(validateResourceFile({ type: "text/plain", size: 1024 })).not.toBeNull();
    expect(validateResourceFile({ type: "application/x-msdownload", size: 1024 })).not.toBeNull();
  });

  it("rejects a file over 50MB even with an allowed MIME type", () => {
    expect(validateResourceFile({ type: "application/pdf", size: RESOURCE_FILE_MAX_BYTES + 1 })).not.toBeNull();
  });

  it("accepts a file exactly at the 50MB limit", () => {
    expect(validateResourceFile({ type: "application/pdf", size: RESOURCE_FILE_MAX_BYTES })).toBeNull();
  });
});

describe("publishValidationError", () => {
  const base = { status: "published" as const, coverImageUrl: "https://x/cover.png", filePath: null as string | null, ctaUrl: null as string | null };

  it("requires a cover image before anything else", () => {
    expect(publishValidationError({ ...base, coverImageUrl: null, deliveryMode: "web_app", ctaUrl: "https://x" })).toMatch(/รูปปก/);
  });

  it("file_download requires a file_path, and a cta_url alone is not enough", () => {
    expect(publishValidationError({ ...base, deliveryMode: "file_download", filePath: null, ctaUrl: "https://x" })).toMatch(/ไฟล์แนบ/);
    expect(publishValidationError({ ...base, deliveryMode: "file_download", filePath: "r/file.pdf" })).toBeNull();
  });

  it("web_app, google_template, and google_form each require a cta_url, and a file alone is not enough", () => {
    for (const deliveryMode of ["web_app", "google_template", "google_form"] as const) {
      expect(publishValidationError({ ...base, deliveryMode, ctaUrl: null, filePath: "r/file.pdf" })).toMatch(/ลิงก์/);
      expect(publishValidationError({ ...base, deliveryMode, ctaUrl: "https://x" })).toBeNull();
    }
  });

  it("skips all checks when not publishing", () => {
    expect(publishValidationError({ status: "draft", deliveryMode: "file_download", coverImageUrl: null, filePath: null, ctaUrl: null })).toBeNull();
  });
});

describe("nextResourceFileFields", () => {
  const current = { file_path: "r/old.pdf", file_name: "old.pdf", file_size: 100, file_mime_type: "application/pdf" };
  const pending: PendingFile = { path: "r/new.pdf", name: "new.pdf", size: 200, mimeType: "application/pdf" };

  it("a pending upload wins over everything", () => {
    expect(nextResourceFileFields(current, pending, false)).toEqual({ file_path: "r/new.pdf", file_name: "new.pdf", file_size: 200, file_mime_type: "application/pdf" });
    expect(nextResourceFileFields(current, pending, true)).toEqual({ file_path: "r/new.pdf", file_name: "new.pdf", file_size: 200, file_mime_type: "application/pdf" });
  });

  it("a removal with no pending upload clears the file fields", () => {
    expect(nextResourceFileFields(current, null, true)).toEqual({ file_path: null, file_name: null, file_size: null, file_mime_type: null });
  });

  it("neither pending nor removed keeps the current file untouched", () => {
    expect(nextResourceFileFields(current, null, false)).toEqual(current);
  });
});

function fakeStorage(removeImpl?: (paths: string[]) => Promise<{ error: { message: string } | null }>): StorageRemover & { remove: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn(removeImpl ?? (async () => ({ error: null }))) };
}

describe("commitResourceFileChange", () => {
  const pendingFile: PendingFile = { path: "r/new.pdf", name: "new.pdf", size: 200, mimeType: "application/pdf" };

  it("on a failed save, deletes only the pending upload and leaves the old file alone", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => ({ error: { message: "constraint violation" } }));

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: "r/old.pdf", pendingFile, fileRemoved: false });

    expect(result.ok).toBe(false);
    expect(result.saveError).toBe("constraint violation");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(["r/new.pdf"]);
    // the old file is never referenced by any remove() call
    expect(storage.remove).not.toHaveBeenCalledWith(["r/old.pdf"]);
  });

  it("on a failed save with nothing pending (e.g. only removing an existing file), no cleanup call is made and the old file is untouched", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => ({ error: { message: "constraint violation" } }));

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: "r/old.pdf", pendingFile: null, fileRemoved: true });

    expect(result.ok).toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("on a successful save that replaces a file, deletes the old file only after the save succeeds", async () => {
    const calls: string[] = [];
    const storage = fakeStorage(async (paths) => {
      calls.push(`remove:${paths.join(",")}`);
      return { error: null };
    });
    const saveRow = vi.fn(async () => {
      calls.push("save");
      return { error: null };
    });

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: "r/old.pdf", pendingFile, fileRemoved: false });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["save", "remove:r/old.pdf"]);
  });

  it("on a successful save with no previous file, does not attempt any cleanup", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => ({ error: null }));

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: null, pendingFile, fileRemoved: false });

    expect(result.ok).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("reports a cleanup failure instead of swallowing it, while still treating the save as successful", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "network error" } }));
    const saveRow = vi.fn(async () => ({ error: null }));

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: "r/old.pdf", pendingFile, fileRemoved: false });

    expect(result.ok).toBe(true);
    expect(result.cleanupErrors).toHaveLength(1);
    expect(result.cleanupErrors[0]).toMatch(/network error/);
  });
});

describe("discardPendingUpload", () => {
  it("does nothing and returns null when there is no pending upload (form cancelled with nothing to clean up)", async () => {
    const storage = fakeStorage();
    const result = await discardPendingUpload(storage, null);
    expect(result).toBeNull();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes the pending upload's object when cancelling/closing the form with one present", async () => {
    const storage = fakeStorage();
    const pendingFile: PendingFile = { path: "r/new.pdf", name: "new.pdf", size: 200, mimeType: "application/pdf" };

    const result = await discardPendingUpload(storage, pendingFile);

    expect(result).toBeNull();
    expect(storage.remove).toHaveBeenCalledWith(["r/new.pdf"]);
  });

  it("surfaces a cleanup error instead of ignoring it", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "boom" } }));
    const pendingFile: PendingFile = { path: "r/new.pdf", name: "new.pdf", size: 200, mimeType: "application/pdf" };

    const result = await discardPendingUpload(storage, pendingFile);

    expect(result).toMatch(/boom/);
  });
});
