import { describe, expect, it } from "vitest";
import { CURRICULUM_PACKS } from "./curriculum";
import {
  createBackupEnvelope,
  createWorksheetSnapshot,
  parseBackupEnvelope,
  validateOverviewCounts,
} from "./storage";
import { CLASSROOM_SCHEMA_VERSION, type ClassroomLocalState } from "./types";

describe("classroom curriculum packs", () => {
  it("contains one five-question pack per supported grade with verified indicator codes", () => {
    expect(CURRICULUM_PACKS.map((pack) => pack.target.grade)).toEqual(["ป.4", "ป.5", "ป.6"]);
    expect(CURRICULUM_PACKS.map((pack) => pack.target.indicatorCode)).toEqual([
      "ค 1.1 ป.4/10",
      "ค 1.1 ป.5/9",
      "ค 1.1 ป.6/11",
    ]);
    expect(CURRICULUM_PACKS.every((pack) => pack.questions.length === 5)).toBe(true);
  });

  it("snapshots the curriculum pack instead of keeping a live reference", () => {
    const pack = CURRICULUM_PACKS[0];
    const worksheet = createWorksheetSnapshot(
      pack,
      "ห้องทดลอง",
      new Date("2026-09-24T00:00:00.000Z"),
      () => "worksheet-id",
    );
    expect(worksheet.curriculumPackId).toBe(pack.id);
    expect(worksheet.curriculumPackVersion).toBe("1.0.0");
    expect(worksheet.curriculumSnapshot).not.toBe(pack.target);
    expect(worksheet.questions).not.toBe(pack.questions);
  });
});

describe("classroom backup", () => {
  const state: ClassroomLocalState = {
    schemaVersion: CLASSROOM_SCHEMA_VERSION,
    worksheets: [],
    results: [],
  };

  it("round-trips a versioned, explicitly unencrypted prototype backup", () => {
    const envelope = createBackupEnvelope(state, new Date("2026-09-24T00:00:00.000Z"));
    expect(envelope.encrypted).toBe(false);
    expect(envelope.containsPersonalData).toBe(false);
    expect(parseBackupEnvelope(JSON.stringify(envelope))).toEqual(state);
  });

  it("rejects an unknown backup schema", () => {
    const envelope = { ...createBackupEnvelope(state), schemaVersion: 2 };
    expect(() => parseBackupEnvelope(JSON.stringify(envelope))).toThrow("เวอร์ชัน");
  });

  it("rejects a backup whose nested worksheet data is incomplete", () => {
    const worksheet = createWorksheetSnapshot(
      CURRICULUM_PACKS[0],
      "ห้องทดลอง",
      new Date("2026-09-24T00:00:00.000Z"),
      () => "worksheet-id",
    );
    const envelope = createBackupEnvelope({
      ...state,
      worksheets: [{ ...worksheet, curriculumSnapshot: undefined } as unknown as typeof worksheet],
    });
    expect(() => parseBackupEnvelope(JSON.stringify(envelope))).toThrow("รูปแบบ");
  });
});

describe("overview validation", () => {
  it("accepts integer counts from zero through the respondent count", () => {
    expect(validateOverviewCounts(12, ["q1", "q2"], { q1: 0, q2: 12 })).toBeNull();
  });

  it("rejects a correct count greater than the respondent count", () => {
    expect(validateOverviewCounts(12, ["q1"], { q1: 13 })).toContain("0 ถึง 12");
  });
});
