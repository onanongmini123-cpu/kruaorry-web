"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileUp,
  HardDrive,
  History,
  Printer,
  RotateCcw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { CURRICULUM_PACKS } from "@/lib/classroom/curriculum";
import {
  EMPTY_CLASSROOM_STATE,
  createBackupEnvelope,
  createResultOverview,
  createWorksheetSnapshot,
  loadClassroomState,
  parseBackupEnvelope,
  saveClassroomState,
  validateOverviewCounts,
} from "@/lib/classroom/storage";
import type { ClassroomLocalState, ResultOverview, WorksheetSnapshot } from "@/lib/classroom/types";
import styles from "./classroom.module.css";

function thaiDate(isoDate: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function resultForWorksheet(state: ClassroomLocalState, worksheetId: string): ResultOverview | undefined {
  return state.results.find((result) => result.worksheetId === worksheetId);
}

function initialCorrectCounts(worksheet: WorksheetSnapshot, result?: ResultOverview): Record<string, string> {
  return Object.fromEntries(
    worksheet.questions.map((question) => [
      question.id,
      result ? String(result.correctCounts[question.id] ?? 0) : "",
    ]),
  );
}

export default function ClassroomPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ClassroomLocalState>(EMPTY_CLASSROOM_STATE);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState(CURRICULUM_PACKS[0].id);
  const [classLabel, setClassLabel] = useState("");
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [respondentCount, setRespondentCount] = useState("");
  const [correctCounts, setCorrectCounts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const selectedPack = useMemo(
    () => CURRICULUM_PACKS.find((pack) => pack.id === selectedPackId) ?? CURRICULUM_PACKS[0],
    [selectedPackId],
  );
  const activeWorksheet = useMemo(
    () => state.worksheets.find((worksheet) => worksheet.id === activeWorksheetId) ?? null,
    [activeWorksheetId, state.worksheets],
  );
  const latestResult = activeWorksheet
    ? resultForWorksheet(state, activeWorksheet.id)
    : undefined;

  useEffect(() => {
    const initializeTimer = window.setTimeout(() => {
      const stored = loadClassroomState(window.localStorage);
      setState(stored);
      const firstWorksheet = stored.worksheets[0];
      if (firstWorksheet) {
        const result = resultForWorksheet(stored, firstWorksheet.id);
        setActiveWorksheetId(firstWorksheet.id);
        setRespondentCount(result ? String(result.respondentCount) : "");
        setCorrectCounts(initialCorrectCounts(firstWorksheet, result));
      }
      setStorageReady(true);
      setIsOnline(window.navigator.onLine);
    }, 0);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearTimeout(initializeTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const commitState = (nextState: ClassroomLocalState, successMessage: string): boolean => {
    try {
      saveClassroomState(window.localStorage, nextState);
      setState(nextState);
      setError(null);
      setNotice(successMessage);
      return true;
    } catch {
      setNotice(null);
      setError("บันทึกลงเบราว์เซอร์ไม่สำเร็จ พื้นที่อาจเต็มหรือถูกปิดใช้งาน");
      return false;
    }
  };

  const handleCreateWorksheet = () => {
    const worksheet = createWorksheetSnapshot(selectedPack, classLabel);
    const nextState = {
      ...state,
      worksheets: [worksheet, ...state.worksheets],
    };
    if (commitState(nextState, "สร้างใบงานและบันทึกไว้ในเบราว์เซอร์นี้แล้ว")) {
      setActiveWorksheetId(worksheet.id);
      setRespondentCount("");
      setCorrectCounts(initialCorrectCounts(worksheet));
    }
  };

  const handleSelectWorksheet = (worksheet: WorksheetSnapshot) => {
    const result = resultForWorksheet(state, worksheet.id);
    setActiveWorksheetId(worksheet.id);
    setRespondentCount(result ? String(result.respondentCount) : "");
    setCorrectCounts(initialCorrectCounts(worksheet, result));
    setNotice(null);
    setError(null);
  };

  const handleSaveOverview = () => {
    if (!activeWorksheet) return;
    const numericRespondentCount = Number(respondentCount);
    const numericCorrectCounts = Object.fromEntries(
      activeWorksheet.questions.map((question) => [question.id, Number(correctCounts[question.id])]),
    );
    const validationError = validateOverviewCounts(
      numericRespondentCount,
      activeWorksheet.questions.map((question) => question.id),
      numericCorrectCounts,
    );
    if (validationError) {
      setNotice(null);
      setError(validationError);
      return;
    }

    const result = createResultOverview(
      activeWorksheet.id,
      numericRespondentCount,
      numericCorrectCounts,
    );
    const nextState = {
      ...state,
      results: [result, ...state.results.filter((item) => item.worksheetId !== activeWorksheet.id)],
    };
    commitState(nextState, "บันทึกภาพรวมผลการเรียนไว้ในเบราว์เซอร์นี้แล้ว");
  };

  const handleExport = () => {
    const backup = createBackupEnvelope(state);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kruaorry-classroom-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setError(null);
    setNotice("ส่งออกไฟล์สำรองต้นแบบแล้ว ไฟล์นี้ไม่ได้เข้ารหัส");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const importedState = parseBackupEnvelope(await file.text());
      if (commitState(importedState, "นำเข้าไฟล์สำรองเรียบร้อยแล้ว")) {
        const firstWorksheet = importedState.worksheets[0];
        setActiveWorksheetId(firstWorksheet?.id ?? null);
        if (firstWorksheet) {
          const result = resultForWorksheet(importedState, firstWorksheet.id);
          setRespondentCount(result ? String(result.respondentCount) : "");
          setCorrectCounts(initialCorrectCounts(firstWorksheet, result));
        } else {
          setRespondentCount("");
          setCorrectCounts({});
        }
      }
    } catch (importError) {
      setNotice(null);
      setError(importError instanceof Error ? importError.message : "นำเข้าไฟล์สำรองไม่สำเร็จ");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <div className={styles.page}>
      <header className={`${styles.topbar} ${styles.noPrint}`}>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push("/app")}>
          กลับหน้าสมาชิก
        </Button>
        <div className={styles.brandTitle}>
          <ClipboardCheck size={22} aria-hidden="true" />
          <span>Kru Aorry Classroom</span>
          <span className={styles.phaseBadge}>Phase 1</span>
        </div>
        <span className={isOnline ? styles.online : styles.offline}>
          {isOnline ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
          {isOnline ? "ออนไลน์" : "ออฟไลน์"}
        </span>
      </header>

      <main className={styles.main}>
        <section className={`${styles.hero} ${styles.noPrint}`}>
          <div>
            <h1>สร้าง Exit Ticket แล้วเห็นทันทีว่าข้อไหนควรทบทวน</h1>
            <p>
              รองรับกรอบหลักสูตรและเป้าหมายการเรียนรู้ของ สพฐ. โดยครูเลือกหลักสูตรที่สถานศึกษาใช้จริง
            </p>
          </div>
          <div className={styles.localCallout}>
            <HardDrive size={28} aria-hidden="true" />
            <div>
              <strong>ข้อมูลอยู่ในเบราว์เซอร์/อุปกรณ์นี้เท่านั้น</strong>
              <span>ไม่มีรายชื่อนักเรียนและผลคะแนนถูกส่งขึ้น Supabase โดยค่าเริ่มต้น</span>
            </div>
          </div>
        </section>

        <div className={`${styles.workspace} ${styles.noPrint}`}>
          <div className={styles.primaryColumn}>
            <section className={styles.panel} aria-labelledby="create-title">
              <div className={styles.sectionHeading}>
                <span className={styles.step}>1</span>
                <div>
                  <h2 id="create-title">เลือกเป้าหมายและสร้างใบงาน</h2>
                  <p>ต้นแบบนี้รองรับคณิตศาสตร์ ป.4–ป.6 ชุดละ 5 ข้อ</p>
                </div>
              </div>

              <div className={styles.formGrid}>
                <Select
                  label="ชุดเป้าหมายการเรียนรู้"
                  value={selectedPackId}
                  onChange={setSelectedPackId}
                  options={CURRICULUM_PACKS.map((pack) => ({
                    value: pack.id,
                    label: `${pack.target.grade} · ${pack.target.indicatorCode} · ${pack.title.replace("Exit Ticket: ", "")}`,
                  }))}
                />
                <Input
                  label="ป้ายกำกับห้อง (ไม่บังคับ)"
                  value={classLabel}
                  maxLength={40}
                  placeholder="เช่น ห้อง 5/1 — ห้ามใส่ชื่อนักเรียน"
                  onChange={(event) => setClassLabel(event.target.value)}
                />
              </div>

              <div className={styles.targetCard}>
                <div>
                  <span>{selectedPack.target.subject} · {selectedPack.target.grade}</span>
                  <strong>{selectedPack.target.indicatorCode}</strong>
                </div>
                <p>{selectedPack.target.indicatorText}</p>
                <a href={selectedPack.target.source.url} target="_blank" rel="noreferrer">
                  ที่มา: {selectedPack.target.source.edition} · {selectedPack.target.source.pageReference}
                </a>
              </div>

              <Button size="lg" icon={ClipboardCheck} onClick={handleCreateWorksheet} disabled={!storageReady}>
                สร้างใบงาน 5 ข้อ
              </Button>
            </section>

            {activeWorksheet && (
              <>
                <section className={styles.panel} aria-labelledby="print-title">
                  <div className={styles.sectionHeading}>
                    <span className={styles.step}>2</span>
                    <div>
                      <h2 id="print-title">ตรวจตัวอย่างและพิมพ์</h2>
                      <p>ใบงานขาวดำ A4 พร้อมเฉลยแยกหน้า</p>
                    </div>
                  </div>
                  <div className={styles.inlineActions}>
                    <Button icon={Printer} onClick={() => window.print()}>พิมพ์ใบงานและเฉลย</Button>
                    <span>สร้างเมื่อ {thaiDate(activeWorksheet.createdAt)}</span>
                  </div>
                </section>

                <section className={styles.panel} aria-labelledby="result-title">
                  <div className={styles.sectionHeading}>
                    <span className={styles.step}>3</span>
                    <div>
                      <h2 id="result-title">บันทึกภาพรวมผลการเรียน</h2>
                      <p>กรอกเพียงจำนวนผู้ตอบถูกต่อข้อ ไม่เก็บรายชื่อหรือคะแนนรายคน</p>
                    </div>
                  </div>
                  <Input
                    label="จำนวนผู้ทำแบบฝึกทั้งหมด"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={respondentCount}
                    onChange={(event) => setRespondentCount(event.target.value)}
                    containerClassName={styles.respondentInput}
                  />
                  <div className={styles.countGrid}>
                    {activeWorksheet.questions.map((question, index) => (
                      <Input
                        key={question.id}
                        label={`ข้อ ${index + 1} ตอบถูก (คน)`}
                        type="number"
                        min={0}
                        max={respondentCount || undefined}
                        step={1}
                        inputMode="numeric"
                        value={correctCounts[question.id] ?? ""}
                        onChange={(event) => setCorrectCounts((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))}
                      />
                    ))}
                  </div>
                  <Button icon={CheckCircle2} onClick={handleSaveOverview}>บันทึกภาพรวม</Button>

                  {latestResult && (
                    <div className={styles.reviewGrid} aria-label="สรุปข้อที่ควรทบทวน">
                      {activeWorksheet.questions.map((question, index) => {
                        const correct = latestResult.correctCounts[question.id] ?? 0;
                        const percent = Math.round((correct / latestResult.respondentCount) * 100);
                        const needsReview = percent < 70;
                        return (
                          <div key={question.id} className={needsReview ? styles.reviewNeeded : styles.reviewReady}>
                            <strong>ข้อ {index + 1}</strong>
                            <span>{correct}/{latestResult.respondentCount} คน · {percent}%</span>
                            <small>{needsReview ? "ควรทบทวน" : "ผ่านเกณฑ์ภาพรวม"}</small>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.panel} aria-labelledby="history-title">
              <div className={styles.compactHeading}>
                <History size={20} aria-hidden="true" />
                <h2 id="history-title">ใบงานในเครื่องนี้</h2>
              </div>
              {state.worksheets.length === 0 ? (
                <p className={styles.emptyText}>ยังไม่มีใบงาน สร้างใบแรกจากชุดด้านซ้ายได้เลย</p>
              ) : (
                <div className={styles.historyList}>
                  {state.worksheets.slice(0, 8).map((worksheet) => (
                    <button
                      key={worksheet.id}
                      type="button"
                      className={worksheet.id === activeWorksheetId ? styles.historyActive : styles.historyItem}
                      onClick={() => handleSelectWorksheet(worksheet)}
                    >
                      <strong>{worksheet.curriculumSnapshot.grade} · {worksheet.title.replace("Exit Ticket: ", "")}</strong>
                      <span>{worksheet.classLabel || "ไม่ระบุห้อง"} · {thaiDate(worksheet.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.warningPanel} aria-labelledby="backup-title">
              <div className={styles.compactHeading}>
                <ShieldCheck size={20} aria-hidden="true" />
                <h2 id="backup-title">สำรองข้อมูลต้นแบบ</h2>
              </div>
              <p><strong>Phase 1: ไฟล์สำรองยังไม่เข้ารหัส</strong> ห้ามใช้ชื่อหรือข้อมูลจริงของนักเรียน</p>
              <div className={styles.backupActions}>
                <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={!storageReady}>
                  ส่งออก JSON
                </Button>
                <Button variant="ghost" size="sm" icon={FileUp} onClick={() => importInputRef.current?.click()}>
                  นำเข้า
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className={styles.hiddenInput}
                  onChange={(event) => void handleImport(event.target.files?.[0])}
                />
              </div>
            </section>

            <section className={styles.limitPanel}>
              <div className={styles.compactHeading}>
                <RotateCcw size={20} aria-hidden="true" />
                <h2>ขอบเขต Phase 1</h2>
              </div>
              <ul>
                <li>โหมดภาพรวมเท่านั้น ยังไม่มีคะแนนรายคน</li>
                <li>ไม่ซิงก์ข้ามอุปกรณ์และไม่สำรองบนคลาวด์</li>
                <li>เมื่อเปิดหน้านี้ไว้แล้ว ยังสร้าง บันทึก และพิมพ์ได้ขณะออฟไลน์</li>
                <li>ยังไม่รับรองการเปิดหน้าใหม่หลังปิดแท็บขณะออฟไลน์</li>
                <li>ครูต้องตรวจว่าชุดเป้าหมายตรงกับหลักสูตรที่โรงเรียนใช้จริง</li>
              </ul>
            </section>

            {(notice || error) && (
              <div className={error ? styles.errorNotice : styles.successNotice} role="status">
                {error ?? notice}
              </div>
            )}
          </aside>
        </div>

        {activeWorksheet && (
          <section className={styles.printRoot} aria-label="ตัวอย่างใบงานสำหรับพิมพ์">
            <article className={styles.paperSheet}>
              <div className={styles.paperHeader}>
                <div>
                  <strong>Kru Aorry Classroom · Exit Ticket</strong>
                  <span>{activeWorksheet.curriculumSnapshot.subject} {activeWorksheet.curriculumSnapshot.grade}</span>
                </div>
                <span>คะแนน ______ / 5</span>
              </div>
              <h2>{activeWorksheet.title}</h2>
              <p className={styles.paperMeta}>
                ห้อง ____________________ ชื่อ–สกุล __________________________________ วันที่ ____________
              </p>
              <div className={styles.paperTarget}>
                <strong>{activeWorksheet.curriculumSnapshot.indicatorCode}</strong>
                <span>{activeWorksheet.curriculumSnapshot.indicatorText}</span>
              </div>
              <ol className={styles.questionList}>
                {activeWorksheet.questions.map((question) => (
                  <li key={question.id}>
                    <span>{question.prompt}</span>
                    <div className={styles.answerLines} aria-hidden="true" />
                  </li>
                ))}
              </ol>
              <footer>curriculumPackId: {activeWorksheet.curriculumPackId} · v{activeWorksheet.curriculumPackVersion}</footer>
            </article>

            <article className={`${styles.paperSheet} ${styles.answerSheet}`}>
              <div className={styles.paperHeader}>
                <div>
                  <strong>เฉลยสำหรับครู</strong>
                  <span>{activeWorksheet.curriculumSnapshot.subject} {activeWorksheet.curriculumSnapshot.grade}</span>
                </div>
                <span>{activeWorksheet.curriculumSnapshot.indicatorCode}</span>
              </div>
              <h2>{activeWorksheet.title}</h2>
              <ol className={styles.solutionList}>
                {activeWorksheet.questions.map((question) => (
                  <li key={question.id}>
                    <strong>{question.expectedAnswer}</strong>
                    <span>{question.solution}</span>
                  </li>
                ))}
              </ol>
              <div className={styles.sourceBlock}>
                <strong>กรอบอ้างอิง</strong>
                <span>{activeWorksheet.curriculumSnapshot.source.title}</span>
                <span>{activeWorksheet.curriculumSnapshot.source.edition} · {activeWorksheet.curriculumSnapshot.source.pageReference}</span>
              </div>
              <footer>Worksheet ID: {activeWorksheet.id}</footer>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
