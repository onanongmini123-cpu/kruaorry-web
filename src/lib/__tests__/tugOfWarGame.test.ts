import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Question = {
  id: string;
  category: "math" | "english" | "thai";
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  visual?: string;
};

const gamePath = join(process.cwd(), "public", "games", "tug-of-war", "index.html");
const html = readFileSync(gamePath, "utf8");
const landingPage = readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
const dataStart = script.indexOf("const CATEGORY_LABELS");
const dataEnd = script.indexOf("const $ =");
const sandbox: Record<string, unknown> = {};

runInNewContext(
  `${script.slice(dataStart, dataEnd)}; this.__bank = { QUESTIONS, CATEGORY_LABELS, ENGLISH_LABELS };`,
  sandbox,
);

const bank = sandbox.__bank as {
  QUESTIONS: Question[];
  CATEGORY_LABELS: Record<string, string>;
  ENGLISH_LABELS: Record<string, string>;
};

describe("tug-of-war static game", () => {
  it("stays self-contained and exposes the required game controls", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(html).toContain('id="startBtn"');
    expect(html).toContain('id="readyBtn"');
    expect(html).toContain('id="pauseBtn"');
    expect(html).toContain('id="restartBtn"');
    expect(html).toContain('id="savePngBtn"');
    expect(html).toContain('const STORAGE_KEY = "kruaorry_tugofwar_v1"');
    expect(landingPage).toContain('href="/games/tug-of-war/index.html"');
    expect(landingPage).toContain('src="/games/tug-of-war/cover.png"');
  });

  it("ships 60 unique, automatically checkable questions", () => {
    expect(bank.QUESTIONS).toHaveLength(60);
    expect(new Set(bank.QUESTIONS.map((question) => question.id)).size).toBe(60);

    for (const category of Object.keys(bank.CATEGORY_LABELS)) {
      expect(bank.QUESTIONS.filter((question) => question.category === category)).toHaveLength(20);
    }

    for (const question of bank.QUESTIONS) {
      expect(question.prompt.trim()).not.toBe("");
      expect(question.explanation.trim()).not.toBe("");
      expect(question.choices).toHaveLength(3);
      expect(new Set(question.choices).size).toBe(3);
      expect(question.choices.filter((choice) => choice === question.answer)).toHaveLength(1);

      if (question.category === "english") {
        expect(question.visual).toBeTruthy();
        expect(bank.ENGLISH_LABELS[question.visual ?? ""]).toBeTruthy();
      }
    }
  });

  it("has enough non-repeating questions for 10 turns per team in every category", () => {
    for (const category of Object.keys(bank.CATEGORY_LABELS)) {
      const ids = bank.QUESTIONS
        .filter((question) => question.category === category)
        .map((question) => question.id);
      expect(new Set(ids).size).toBeGreaterThanOrEqual(20);
    }
  });

  it("keeps the paired-round finish and score-difference flag invariants in source", () => {
    expect(script).toContain("state.turnIndex===state.deck.length && state.answered[0]===state.questionCount && state.answered[1]===state.questionCount");
    expect(script).toContain("const diff=state.scores[0]-state.scores[1]");
    expect(script).toContain("const offset=(state.scores[1]-state.scores[0])*(200/state.questionCount)");
    expect(script).toContain("if(state.phase!==\"active\" || state.answerLocked || state.paused) return");
  });

  it("keeps mobile controls named and timed dialogs safe for keyboard users", () => {
    expect(html).toContain('id="pauseBtn" class="icon-btn" type="button" aria-label="หยุดพัก"');
    expect(html).toContain('id="restartBtn" class="icon-btn" type="button" aria-label="เริ่มเกมใหม่"');
    expect(html).toContain('id="homeBtn" class="icon-btn" type="button" aria-label="กลับหน้าหลัก"');
    expect(html).not.toContain('class="question-card" aria-live="polite"');
    expect(html).toContain('id="timerChip" class="timer-chip" role="timer" aria-live="off"');
    expect(script).toContain("document.querySelector('.app').setAttribute('inert','')");
    expect(script).toContain("els.prompt.focus({preventScroll:true})");
    expect(script).toContain("els.resultTitle.focus({preventScroll:true})");
    expect(script).toContain("if(howToPausedTimer && state.phase===\"active\" && !state.paused) startTimer()");
    expect(script).toContain("button.setAttribute('aria-pressed',String(on))");
    expect(script).toContain("button.setAttribute('aria-label','เสียงประกอบ')");
  });
});
