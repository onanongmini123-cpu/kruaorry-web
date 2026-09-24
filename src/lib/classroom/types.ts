export const CLASSROOM_SCHEMA_VERSION = 1 as const;
export const CLASSROOM_BACKUP_KIND = "kruaorry-classroom-backup" as const;

export type ClassroomGrade = "ป.4" | "ป.5" | "ป.6";

export interface CurriculumSource {
  title: string;
  publisher: string;
  edition: string;
  url: string;
  pageReference: string;
}

export interface CurriculumTarget {
  subject: "คณิตศาสตร์";
  grade: ClassroomGrade;
  standardCode: string;
  indicatorCode: string;
  indicatorText: string;
  source: CurriculumSource;
}

export interface ClassroomQuestion {
  id: string;
  prompt: string;
  expectedAnswer: string;
  solution: string;
}

export interface CurriculumPack {
  id: string;
  version: string;
  title: string;
  target: CurriculumTarget;
  questions: ClassroomQuestion[];
}

export interface WorksheetSnapshot {
  schemaVersion: typeof CLASSROOM_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  classLabel: string;
  title: string;
  curriculumPackId: string;
  curriculumPackVersion: string;
  curriculumSnapshot: CurriculumTarget;
  questions: ClassroomQuestion[];
}

export interface ResultOverview {
  schemaVersion: typeof CLASSROOM_SCHEMA_VERSION;
  id: string;
  worksheetId: string;
  createdAt: string;
  respondentCount: number;
  correctCounts: Record<string, number>;
}

export interface ClassroomLocalState {
  schemaVersion: typeof CLASSROOM_SCHEMA_VERSION;
  worksheets: WorksheetSnapshot[];
  results: ResultOverview[];
}

export interface ClassroomBackupEnvelope {
  kind: typeof CLASSROOM_BACKUP_KIND;
  schemaVersion: typeof CLASSROOM_SCHEMA_VERSION;
  exportedAt: string;
  prototype: true;
  encrypted: false;
  containsPersonalData: false;
  data: ClassroomLocalState;
}
