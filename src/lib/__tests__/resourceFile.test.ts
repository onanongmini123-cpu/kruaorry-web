import { describe, expect, it, vi } from "vitest";
import {
  validateResourceFile,
  publishValidationError,
  evaluatePublishGuard,
  nextResourceFileFields,
  commitResourceFileChange,
  retryCleanup,
  guardAgainstBusyForm,
  chooseUploadStrategy,
  resumableUploadEndpoint,
  RESOURCE_FILE_MAX_BYTES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
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
    expect(validateResourceFile({ type: "application/x-msdownload", size: 1024 })).not.toBeNull();
  });

  it("rejects a file over 50MB even with an allowed MIME type", () => {
    expect(validateResourceFile({ type: "application/pdf", size: RESOURCE_FILE_MAX_BYTES + 1 })).not.toBeNull();
  });

  it("accepts a file exactly at the 50MB limit", () => {
    expect(validateResourceFile({ type: "application/pdf", size: RESOURCE_FILE_MAX_BYTES })).toBeNull();
  });
});

// "เส้นทางไฟล์เกิน 6 MB ใช้ resumable upload"
describe("chooseUploadStrategy", () => {
  it("uses the standard upload for files at or under the 6MB chunk size", () => {
    expect(chooseUploadStrategy(1024)).toBe("standard");
    expect(chooseUploadStrategy(RESUMABLE_UPLOAD_THRESHOLD_BYTES)).toBe("standard");
  });

  it("uses resumable (TUS) upload for anything over 6MB, up to the full 50MB limit", () => {
    expect(chooseUploadStrategy(RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1)).toBe("resumable");
    expect(chooseUploadStrategy(RESOURCE_FILE_MAX_BYTES)).toBe("resumable");
  });
});

describe("resumableUploadEndpoint", () => {
  it("builds the direct storage hostname required for TUS, from the normal project URL", () => {
    expect(resumableUploadEndpoint("https://ghwpmtmbqtchsrnagoir.supabase.co")).toBe("https://ghwpmtmbqtchsrnagoir.storage.supabase.co/storage/v1/upload/resumable");
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

  // "แก้ Resource ที่ published ให้ผิดประเภท" — editing an already-published
  // resource so it no longer matches its own delivery mode's requirement.
  it("catches editing an already-published file_download resource down to having no file (a cta_url does not substitute)", () => {
    expect(publishValidationError({ status: "published", deliveryMode: "file_download", coverImageUrl: "https://x/cover.png", filePath: null, ctaUrl: "https://x" })).toMatch(/ไฟล์แนบ/);
  });

  it("catches editing an already-published web_app resource down to having no cta_url (a file does not substitute)", () => {
    expect(publishValidationError({ status: "published", deliveryMode: "web_app", coverImageUrl: "https://x/cover.png", filePath: "r/file.pdf", ctaUrl: null })).toMatch(/ลิงก์/);
  });
});

// "query ก่อน publish ล้มเหลว" — fail closed, never publish, when the
// pre-publish lookup itself couldn't be trusted.
describe("evaluatePublishGuard", () => {
  const validCandidate = { status: "published" as const, deliveryMode: "web_app" as const, coverImageUrl: "https://x/cover.png", filePath: null, ctaUrl: "https://x" };

  it("denies when the query returned an error, even though it can't know whether the row would have been valid", () => {
    const result = evaluatePublishGuard({ data: validCandidate, error: { message: "connection reset" } });
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/connection reset/);
  });

  it("denies when the query returned no row (fail closed rather than treating null as no problems)", () => {
    const result = evaluatePublishGuard({ data: null, error: null });
    expect(result.allow).toBe(false);
  });

  it("denies when the row itself would fail publishValidationError", () => {
    const result = evaluatePublishGuard({ data: { ...validCandidate, ctaUrl: null }, error: null });
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/ลิงก์/);
  });

  it("allows only when there is no error, a row exists, and it passes publishValidationError", () => {
    const result = evaluatePublishGuard({ data: validCandidate, error: null });
    expect(result.allow).toBe(true);
    expect(result.reason).toBeNull();
  });
});

// "ปิดฟอร์ม/เปลี่ยนรายการระหว่าง upload" and "กดบันทึกซ้ำระหว่าง upload"
describe("guardAgainstBusyForm", () => {
  it("blocks every guarded action (close form, open another item, nav, sign out, re-submit) while an upload/save is in flight", () => {
    const result = guardAgainstBusyForm(true);
    expect(result.allowed).toBe(false);
    expect(result.message).not.toBeNull();
  });

  it("allows the action once nothing is in flight", () => {
    const result = guardAgainstBusyForm(false);
    expect(result.allowed).toBe(true);
    expect(result.message).toBeNull();
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

  it("reports a cleanup failure as a structured CleanupFailure instead of swallowing it, while still treating the save as successful", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "network error" } }));
    const saveRow = vi.fn(async () => ({ error: null }));

    const result = await commitResourceFileChange({ storage, saveRow, currentFilePath: "r/old.pdf", pendingFile, fileRemoved: false });

    expect(result.ok).toBe(true);
    expect(result.cleanupFailures).toEqual([{ path: "r/old.pdf", message: "network error" }]);
  });
});

// "cleanup ล้มเหลวแล้วยัง retry ได้" and "ลบ Resource แล้วลบ Storage ล้มเหลว"
describe("retryCleanup", () => {
  it("keeps the reference to a path that still fails, so it can be retried again later", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "boom" } }));

    const first = await retryCleanup(storage, ["r/orphan.pdf"]);
    expect(first.succeeded).toEqual([]);
    expect(first.failed).toEqual([{ path: "r/orphan.pdf", message: "boom" }]);

    // caller re-drives retryCleanup with the still-failed paths from `first`
    const second = await retryCleanup(storage, first.failed.map((f) => f.path));
    expect(second.failed).toEqual([{ path: "r/orphan.pdf", message: "boom" }]);
  });

  it("drops a path from the failed list once a retry succeeds", async () => {
    let attempt = 0;
    const storage = fakeStorage(async () => {
      attempt += 1;
      return attempt === 1 ? { error: { message: "boom" } } : { error: null };
    });

    const first = await retryCleanup(storage, ["r/orphan.pdf"]);
    expect(first.failed).toHaveLength(1);

    const second = await retryCleanup(storage, first.failed.map((f) => f.path));
    expect(second.failed).toEqual([]);
    expect(second.succeeded).toEqual(["r/orphan.pdf"]);
  });

  it("used for a deleted resource's attachment: reports the storage failure instead of it being silently ignored", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "object locked" } }));

    // mirrors handleDeleteResource's usage: the row is already gone, only the
    // attached file's cleanup is being retried/reported here
    const result = await retryCleanup(storage, ["r/deleted-resource-file.pdf"]);

    expect(result.failed).toEqual([{ path: "r/deleted-resource-file.pdf", message: "object locked" }]);
  });

  it("partial success: independently tracks which of several paths still need a retry", async () => {
    const storage = fakeStorage(async (paths) => (paths[0].includes("bad") ? { error: { message: "boom" } } : { error: null }));

    const result = await retryCleanup(storage, ["r/good.pdf", "r/bad.pdf"]);

    expect(result.succeeded).toEqual(["r/good.pdf"]);
    expect(result.failed).toEqual([{ path: "r/bad.pdf", message: "boom" }]);
  });
});
