import {
  CLASSROOM_BACKUP_KIND,
  CLASSROOM_SCHEMA_VERSION,
  type ClassroomBackupEnvelope,
  type ClassroomLocalState,
  type CurriculumPack,
  type ResultOverview,
  type WorksheetSnapshot,
} from "./types";

export const CLASSROOM_STORAGE_KEY = "kruaorry:classroom:phase1:v1";

export const EMPTY_CLASSROOM_STATE: ClassroomLocalState = {
  schemaVersion: CLASSROOM_SCHEMA_VERSION,
  worksheets: [],
  results: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCurriculumTarget(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  return value.subject === "คณิตศาสตร์" &&
    ["ป.4", "ป.5", "ป.6"].includes(String(value.grade)) &&
    isNonEmptyString(value.standardCode) &&
    isNonEmptyString(value.indicatorCode) &&
    isNonEmptyString(value.indicatorText) &&
    isNonEmptyString(value.source.title) &&
    isNonEmptyString(value.source.publisher) &&
    isNonEmptyString(value.source.edition) &&
    isNonEmptyString(value.source.url) &&
    isNonEmptyString(value.source.pageReference);
}

function isQuestion(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.prompt) &&
    isNonEmptyString(value.expectedAnswer) &&
    isNonEmptyString(value.solution);
}

function isClassroomState(value: unknown): value is ClassroomLocalState {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== CLASSROOM_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.worksheets) || !Array.isArray(value.results)) return false;
  const worksheets = value.worksheets;
  const results = value.results;

  const worksheetsAreValid = worksheets.every((worksheet) =>
    isRecord(worksheet) &&
    worksheet.schemaVersion === CLASSROOM_SCHEMA_VERSION &&
    isNonEmptyString(worksheet.id) &&
    isNonEmptyString(worksheet.createdAt) &&
    typeof worksheet.classLabel === "string" &&
    isNonEmptyString(worksheet.title) &&
    isNonEmptyString(worksheet.curriculumPackId) &&
    isNonEmptyString(worksheet.curriculumPackVersion) &&
    isCurriculumTarget(worksheet.curriculumSnapshot) &&
    Array.isArray(worksheet.questions) &&
    worksheet.questions.length === 5 &&
    worksheet.questions.every(isQuestion),
  );
  if (!worksheetsAreValid) return false;

  return results.every((result) => {
    if (!isRecord(result) ||
      result.schemaVersion !== CLASSROOM_SCHEMA_VERSION ||
      !isNonEmptyString(result.id) ||
      !isNonEmptyString(result.worksheetId) ||
      !isNonEmptyString(result.createdAt) ||
      typeof result.respondentCount !== "number" ||
      !Number.isInteger(result.respondentCount) ||
      result.respondentCount < 1 ||
      !isRecord(result.correctCounts)) {
      return false;
    }
    const worksheetId = result.worksheetId;
    const respondentCount = result.respondentCount;
    const correctCounts = result.correctCounts;

    const worksheet = worksheets.find((item) =>
      isRecord(item) && item.id === worksheetId,
    );
    if (!isRecord(worksheet) || !Array.isArray(worksheet.questions)) return false;

    return worksheet.questions.every((question) => {
      if (!isRecord(question) || !isNonEmptyString(question.id)) return false;
      const count = correctCounts[question.id];
      return typeof count === "number" &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= respondentCount;
    });
  });
}

export function createWorksheetSnapshot(
  pack: CurriculumPack,
  classLabel: string,
  now = new Date(),
  createId = () => crypto.randomUUID(),
): WorksheetSnapshot {
  return {
    schemaVersion: CLASSROOM_SCHEMA_VERSION,
    id: createId(),
    createdAt: now.toISOString(),
    classLabel: classLabel.trim(),
    title: pack.title,
    curriculumPackId: pack.id,
    curriculumPackVersion: pack.version,
    curriculumSnapshot: structuredClone(pack.target),
    questions: structuredClone(pack.questions),
  };
}

export function createResultOverview(
  worksheetId: string,
  respondentCount: number,
  correctCounts: Record<string, number>,
  now = new Date(),
  createId = () => crypto.randomUUID(),
): ResultOverview {
  return {
    schemaVersion: CLASSROOM_SCHEMA_VERSION,
    id: createId(),
    worksheetId,
    createdAt: now.toISOString(),
    respondentCount,
    correctCounts: { ...correctCounts },
  };
}

export function loadClassroomState(storage: Pick<Storage, "getItem">): ClassroomLocalState {
  const raw = storage.getItem(CLASSROOM_STORAGE_KEY);
  if (!raw) return structuredClone(EMPTY_CLASSROOM_STATE);

  try {
    const parsed: unknown = JSON.parse(raw);
    return isClassroomState(parsed) ? parsed : structuredClone(EMPTY_CLASSROOM_STATE);
  } catch {
    return structuredClone(EMPTY_CLASSROOM_STATE);
  }
}

export function saveClassroomState(storage: Pick<Storage, "setItem">, state: ClassroomLocalState): void {
  storage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify(state));
}

export function createBackupEnvelope(
  state: ClassroomLocalState,
  now = new Date(),
): ClassroomBackupEnvelope {
  return {
    kind: CLASSROOM_BACKUP_KIND,
    schemaVersion: CLASSROOM_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    prototype: true,
    encrypted: false,
    containsPersonalData: false,
    data: structuredClone(state),
  };
}

export function parseBackupEnvelope(raw: string): ClassroomLocalState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ไฟล์สำรองไม่ใช่ JSON ที่อ่านได้");
  }

  if (
    !isRecord(parsed) ||
    parsed.kind !== CLASSROOM_BACKUP_KIND ||
    parsed.schemaVersion !== CLASSROOM_SCHEMA_VERSION ||
    parsed.prototype !== true ||
    parsed.encrypted !== false ||
    parsed.containsPersonalData !== false ||
    !isClassroomState(parsed.data)
  ) {
    throw new Error("รูปแบบหรือเวอร์ชันไฟล์สำรองไม่รองรับ");
  }

  return parsed.data;
}

export function validateOverviewCounts(
  respondentCount: number,
  questionIds: string[],
  correctCounts: Record<string, number>,
): string | null {
  if (!Number.isInteger(respondentCount) || respondentCount < 1) {
    return "กรุณาระบุจำนวนผู้ทำแบบฝึกอย่างน้อย 1 คน";
  }
  for (const questionId of questionIds) {
    const count = correctCounts[questionId];
    if (!Number.isInteger(count) || count < 0 || count > respondentCount) {
      return `จำนวนที่ตอบถูกต้องอยู่ระหว่าง 0 ถึง ${respondentCount}`;
    }
  }
  return null;
}
