import { describe, expect, it, vi } from "vitest";
import {
  validateResourceFile,
  publishValidationError,
  evaluatePublishGuard,
  canProceedAfterFileLookup,
  nextResourceFileFields,
  commitResourceFileChange,
  retryCleanup,
  guardAgainstBusyForm,
  chooseUploadStrategy,
  resumableUploadEndpoint,
  pickResumableUpload,
  runResumableUpload,
  RESOURCE_FILE_MAX_BYTES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  type StorageRemover,
  type StorageObject,
  type PendingFile,
  type TusUploadFactory,
  type TusUploadHandle,
  type TusUploadOptions,
  type TusPreviousUpload,
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

  it("catches editing an already-published file_download resource down to having no file (a cta_url does not substitute)", () => {
    expect(publishValidationError({ status: "published", deliveryMode: "file_download", coverImageUrl: "https://x/cover.png", filePath: null, ctaUrl: "https://x" })).toMatch(/ไฟล์แนบ/);
  });

  it("catches editing an already-published web_app resource down to having no cta_url (a file does not substitute)", () => {
    expect(publishValidationError({ status: "published", deliveryMode: "web_app", coverImageUrl: "https://x/cover.png", filePath: "r/file.pdf", ctaUrl: null })).toMatch(/ลิงก์/);
  });
});

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

// "file_path lookup ล้มเหลวแล้วไม่ลบ Resource"
describe("canProceedAfterFileLookup", () => {
  it("blocks proceeding (with the delete) when the file_path lookup errored", () => {
    expect(canProceedAfterFileLookup({ message: "timeout" })).toBe(false);
  });

  it("allows proceeding when the lookup succeeded", () => {
    expect(canProceedAfterFileLookup(null)).toBe(true);
  });
});

describe("guardAgainstBusyForm", () => {
  it("blocks every guarded action while an upload/save is in flight", () => {
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
  it("on a failed save, deletes only the pending uploads and leaves obsolete (old) files alone", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => ({ error: { message: "constraint violation" } }));
    const pendingUploads: StorageObject[] = [{ storage, path: "r/new.pdf" }];
    const obsoleteOnSuccess: StorageObject[] = [{ storage, path: "r/old.pdf" }];

    const result = await commitResourceFileChange({ saveRow, pendingUploads, obsoleteOnSuccess });

    expect(result.ok).toBe(false);
    expect(result.saveError).toBe("constraint violation");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(["r/new.pdf"]);
    expect(storage.remove).not.toHaveBeenCalledWith(["r/old.pdf"]);
  });

  // "saveRow() throw หลังอัปโหลดสำเร็จ ต้องพยายามลบ pending file"
  it("when saveRow() throws (not just resolves with {error}), still cleans up pending uploads and reports the failure as saveError", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => {
      throw new Error("network dropped mid-request");
    });
    const pendingUploads: StorageObject[] = [{ storage, path: "r/new.pdf" }, { storage, path: "covers/new-cover.png" }];

    const result = await commitResourceFileChange({ saveRow, pendingUploads, obsoleteOnSuccess: [] });

    expect(result.ok).toBe(false);
    expect(result.saveError).toMatch(/network dropped/);
    expect(storage.remove).toHaveBeenCalledWith(["r/new.pdf"]);
    expect(storage.remove).toHaveBeenCalledWith(["covers/new-cover.png"]);
  });

  it("on a successful save that replaces a file, deletes the obsolete file only after the save succeeds", async () => {
    const calls: string[] = [];
    const storage = fakeStorage(async (paths) => {
      calls.push(`remove:${paths.join(",")}`);
      return { error: null };
    });
    const saveRow = vi.fn(async () => {
      calls.push("save");
      return { error: null };
    });

    const result = await commitResourceFileChange({
      saveRow,
      pendingUploads: [{ storage, path: "r/new.pdf" }],
      obsoleteOnSuccess: [{ storage, path: "r/old.pdf" }],
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["save", "remove:r/old.pdf"]);
  });

  it("on a successful save with nothing obsolete, does not attempt any cleanup", async () => {
    const storage = fakeStorage();
    const saveRow = vi.fn(async () => ({ error: null }));

    const result = await commitResourceFileChange({ saveRow, pendingUploads: [{ storage, path: "r/new.pdf" }], obsoleteOnSuccess: [] });

    expect(result.ok).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("reports a cleanup failure as a structured CleanupFailure instead of swallowing it, while still treating the save as successful", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "network error" } }));
    const saveRow = vi.fn(async () => ({ error: null }));

    const result = await commitResourceFileChange({ saveRow, pendingUploads: [], obsoleteOnSuccess: [{ storage, path: "r/old.pdf" }] });

    expect(result.ok).toBe(true);
    expect(result.cleanupFailures).toEqual([{ path: "r/old.pdf", message: "network error", storage }]);
  });
});

describe("retryCleanup", () => {
  it("keeps the reference to a path that still fails, so it can be retried again later", async () => {
    const storage = fakeStorage(async () => ({ error: { message: "boom" } }));

    const first = await retryCleanup([{ storage, path: "r/orphan.pdf" }]);
    expect(first.succeeded).toEqual([]);
    expect(first.failed).toEqual([{ path: "r/orphan.pdf", message: "boom", storage }]);

    const second = await retryCleanup(first.failed.map((f) => ({ storage: f.storage, path: f.path })));
    expect(second.failed).toEqual([{ path: "r/orphan.pdf", message: "boom", storage }]);
  });

  it("drops a path from the failed list once a retry succeeds", async () => {
    let attempt = 0;
    const storage = fakeStorage(async () => {
      attempt += 1;
      return attempt === 1 ? { error: { message: "boom" } } : { error: null };
    });

    const first = await retryCleanup([{ storage, path: "r/orphan.pdf" }]);
    expect(first.failed).toHaveLength(1);

    const second = await retryCleanup(first.failed.map((f) => ({ storage: f.storage, path: f.path })));
    expect(second.failed).toEqual([]);
    expect(second.succeeded).toEqual(["r/orphan.pdf"]);
  });

  // "storage.remove() throw แล้วยังเก็บ path สำหรับ retry"
  it("keeps the path for retry even when storage.remove() throws instead of resolving with {error}", async () => {
    const storage: StorageRemover = {
      remove: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    };

    const result = await retryCleanup([{ storage, path: "r/orphan.pdf" }]);

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{ path: "r/orphan.pdf", message: "fetch failed", storage }]);
  });

  it("independently tracks which of several paths (possibly across different buckets/storages) still need a retry", async () => {
    const goodStorage = fakeStorage();
    const badStorage = fakeStorage(async () => ({ error: { message: "boom" } }));

    const result = await retryCleanup([
      { storage: goodStorage, path: "r/good.pdf" },
      { storage: badStorage, path: "covers/bad.png" },
    ]);

    expect(result.succeeded).toEqual(["r/good.pdf"]);
    expect(result.failed).toEqual([{ path: "covers/bad.png", message: "boom", storage: badStorage }]);
  });
});

// ---------------------------------------------------------------------
// TUS resumable upload — driven entirely through an injected fake
// createUpload, no real tus-js-client/XHR/jsdom involved.
// ---------------------------------------------------------------------

describe("pickResumableUpload", () => {
  it("never picks index [0] blindly: only a previous upload whose objectName matches is chosen", () => {
    const previous: TusPreviousUpload[] = [{ metadata: { objectName: "other-resource/file.pdf" } }, { metadata: { objectName: "r1/file.pdf" } }];
    expect(pickResumableUpload(previous, "r1/file.pdf")).toBe(previous[1]);
  });

  it("returns null when nothing matches, rather than falling back to any entry", () => {
    const previous: TusPreviousUpload[] = [{ metadata: { objectName: "other-resource/file.pdf" } }];
    expect(pickResumableUpload(previous, "r1/file.pdf")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickResumableUpload([], "r1/file.pdf")).toBeNull();
  });
});

// A controllable fake tus.Upload: captures the options it was constructed
// with (so tests can assert path/fingerprint stability across attempts)
// and exposes the callbacks so a test can fire onProgress/onError/onSuccess.
// `previousUploads` is read lazily (a shared, mutable box) precisely so a
// test can call setPreviousUploads() *before* invoking runResumableUpload —
// the fake's findPreviousUploads() captures its return value synchronously
// at call time, so setting it only after construction would be too late.
function makeFakeTusFactory() {
  const instances: Array<{
    file: File;
    options: TusUploadOptions;
    handle: TusUploadHandle & { aborted: Array<boolean | undefined> };
    resumedWith: TusPreviousUpload | null;
    started: boolean;
  }> = [];
  let previousUploads: TusPreviousUpload[] = [];

  const factory: TusUploadFactory = (file, options) => {
    const record = {
      file,
      options,
      handle: undefined as unknown as TusUploadHandle & { aborted: Array<boolean | undefined> },
      resumedWith: null as TusPreviousUpload | null,
      started: false,
    };
    const aborted: Array<boolean | undefined> = [];
    const handle: TusUploadHandle & { aborted: Array<boolean | undefined> } = {
      aborted,
      start: () => {
        record.started = true;
      },
      abort: vi.fn(async (shouldTerminate?: boolean) => {
        aborted.push(shouldTerminate);
      }),
      findPreviousUploads: vi.fn(async () => previousUploads),
      resumeFromPreviousUpload: vi.fn((previousUpload: TusPreviousUpload) => {
        record.resumedWith = previousUpload;
      }),
    };
    record.handle = handle;
    instances.push(record);
    return handle;
  };

  return {
    factory,
    instances,
    setPreviousUploads: (list: TusPreviousUpload[]) => {
      previousUploads = list;
    },
  };
}

const fakeFile = () => new File([new Uint8Array(10 * 1024 * 1024)], "worksheet.pdf", { type: "application/pdf" });

describe("runResumableUpload", () => {
  it("uses a stable object path across the initial attempt and a retry, and a fingerprint that only varies with bucket/path/file identity", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/abc-worksheet.pdf",
      bucketName: "resource-files",
      endpoint: "https://ref.storage.supabase.co/storage/v1/upload/resumable",
      headers: {},
      onStatusChange: () => {},
    });
    void controller;

    expect(instances).toHaveLength(1);
    const firstOptions = instances[0].options;
    expect(firstOptions.metadata.objectName).toBe("resource-1/abc-worksheet.pdf");
    const firstFingerprint = await firstOptions.fingerprint();

    // simulate a failure, then retry
    instances[0].options.onError(new Error("connection lost"));
    controller.retry();

    expect(instances).toHaveLength(2);
    const secondOptions = instances[1].options;
    expect(secondOptions.metadata.objectName).toBe("resource-1/abc-worksheet.pdf");
    const secondFingerprint = await secondOptions.fingerprint();
    expect(secondFingerprint).toBe(firstFingerprint);
  });

  it("resumes only a previous upload whose objectName matches this path, ignoring unrelated ones", async () => {
    const { factory, instances, setPreviousUploads } = makeFakeTusFactory();
    const file = fakeFile();
    setPreviousUploads([{ metadata: { objectName: "resource-2/xyz-other.pdf" } }, { metadata: { objectName: "resource-1/abc-worksheet.pdf" } }]);

    runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/abc-worksheet.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: () => {},
    });

    // flush the findPreviousUploads().then(...) microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(instances[0].resumedWith).toEqual({ metadata: { objectName: "resource-1/abc-worksheet.pdf" } });
    expect(instances[0].started).toBe(true);
  });

  it("starts fresh (no resumeFromPreviousUpload call) when no previous upload matches this path", async () => {
    const { factory, instances, setPreviousUploads } = makeFakeTusFactory();
    const file = fakeFile();
    setPreviousUploads([{ metadata: { objectName: "resource-2/xyz-other.pdf" } }]);

    runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/abc-worksheet.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: () => {},
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(instances[0].resumedWith).toBeNull();
    expect(instances[0].started).toBe(true);
  });

  it("pause() awaits abort(false), reports the paused status, and does not resolve the outer result", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();
    const statuses: string[] = [];

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: (s) => statuses.push(s.phase),
    });

    const { error } = await controller.pause();

    expect(error).toBeNull();
    expect(instances[0].handle.abort).toHaveBeenCalledWith(false);
    expect(statuses).toContain("paused");

    let settled = false;
    controller.result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("cancel() awaits abort(true) and resolves the outer promise with ok:false", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: () => {},
    });

    const { error } = await controller.cancel();
    const outcome = await controller.result;

    expect(error).toBeNull();
    expect(instances[0].handle.abort).toHaveBeenCalledWith(true);
    expect(outcome).toEqual({ ok: false, file: null });
  });

  // "Error สามารถ cancel และทำให้ outer Promise resolve"
  it("from the error phase, cancel() still resolves the outer result (never leaves it hanging)", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();
    const statuses: string[] = [];

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: (s) => statuses.push(s.phase),
    });

    instances[0].options.onError(new Error("chunk rejected"));
    expect(statuses).toContain("error");

    const { error } = await controller.cancel();
    const outcome = await controller.result;

    expect(error).toBeNull();
    expect(outcome).toEqual({ ok: false, file: null });
  });

  it("catches and reports a rejected abort() from cancel(), while still resolving the outer result", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: () => {},
    });

    (instances[0].handle.abort as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("terminate failed"));

    const { error } = await controller.cancel();
    const outcome = await controller.result;

    expect(error).toMatch(/terminate failed/);
    expect(outcome).toEqual({ ok: false, file: null });
  });

  it("catches and reports a rejected abort() from pause(), without resolving the outer result", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();
    const statuses: string[] = [];

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: (s) => statuses.push(s.phase),
    });

    (instances[0].handle.abort as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("pause failed"));

    const { error } = await controller.pause();

    expect(error).toMatch(/pause failed/);
    expect(statuses.at(-1)).toBe("error");
  });

  it("resolves ok:true with the uploaded file's details on success", async () => {
    const { factory, instances } = makeFakeTusFactory();
    const file = fakeFile();

    const controller = runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: () => {},
    });

    instances[0].options.onSuccess();
    const outcome = await controller.result;

    expect(outcome).toEqual({ ok: true, file: { path: "resource-1/file.pdf", name: "worksheet.pdf", size: file.size, mimeType: "application/pdf" } });
  });

  it("a findPreviousUploads() rejection is caught and reported as an error status instead of hanging", async () => {
    const file = fakeFile();
    const statuses: string[] = [];

    const factory: TusUploadFactory = () => ({
      start: () => {},
      abort: vi.fn(async () => {}),
      findPreviousUploads: () => Promise.reject(new Error("storage unreachable")),
      resumeFromPreviousUpload: vi.fn(),
    });

    runResumableUpload({
      createUpload: factory,
      file,
      path: "resource-1/file.pdf",
      bucketName: "resource-files",
      endpoint: "https://x",
      headers: {},
      onStatusChange: (s) => statuses.push(s.phase),
    });

    // flush the findPreviousUploads().then().catch() microtask chain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(statuses).toContain("error");
  });
});
