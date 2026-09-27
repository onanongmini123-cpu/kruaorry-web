import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderQuickRaceGame } from "./quickRaceGame";

const ASSET_ROOT = "src/server/game-assets/quick-race";

describe("Quick Race server-only bundle", () => {
  it("inlines every executable asset into a nonce-protected document", async () => {
    const html = await renderQuickRaceGame("test-nonce");

    expect(html).toContain('<style nonce="test-nonce">');
    expect(html).toContain('<script nonce="test-nonce">');
    expect(html).toContain("รถแข่งตอบไว");
    expect(html).toContain("window.RACE_CONTENT");
    expect(html).not.toMatch(/(?:href|src)=["'](?:styles\.css|questions\.js|app\.js)["']/);
  });

  it("keeps the playable application out of public static files", () => {
    expect(existsSync("public/games/quick-race/index.html")).toBe(false);
    expect(existsSync("public/games/quick-race/app.js")).toBe(false);
    expect(existsSync(`${ASSET_ROOT}/index.html`)).toBe(true);
    expect(existsSync("public/images/resources/quick-race-quiz.jpg")).toBe(true);
  });

  it("contains no external network, persistence or model-tool bridge", () => {
    const source = ["index.html", "styles.css", "questions.js", "app.js"]
      .map((file) => readFileSync(`${ASSET_ROOT}/${file}`, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/chatgpt\.site|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).not.toMatch(/document\.modelContext|registerTool/);
    expect(source).not.toMatch(/\beval\s*\(|new\s+Function|innerHTML|document\.write/);
  });

  it("validates the 264-question bank and fair schedules", () => {
    const context = { window: {} as Record<string, unknown> };
    vm.runInNewContext(readFileSync(`${ASSET_ROOT}/questions.js`, "utf8"), context);
    const content = context.window.RACE_CONTENT as {
      report: { total: number; byCategory: Record<string, number>; byLevel: Record<string, number> };
      buildSchedule(config: Record<string, unknown>, seed: string): Array<{ questions: Array<{ id: string }> }>;
      buildTieBreak(config: Record<string, unknown>, seed: string, leaders: number[]): { questions: Array<{ id: string }> };
    };

    expect(content.report.total).toBe(264);
    expect({ ...content.report.byCategory }).toEqual({ math: 88, number: 88, english: 88 });
    expect({ ...content.report.byLevel }).toEqual({ starter: 132, fluent: 132 });

    for (const teamCount of [2, 3, 4]) {
      for (const rounds of [5, 10]) {
        for (const category of ["mixed", "math", "number", "english"]) {
          for (const level of ["starter", "fluent"]) {
            const config = { teamCount, rounds, category, level };
            const schedule = content.buildSchedule(config, `${teamCount}-${rounds}-${category}-${level}`);
            expect(schedule).toHaveLength(rounds);
            expect(schedule.every((round) => round.questions.length === teamCount)).toBe(true);
            const ids = schedule.flatMap((round) => round.questions.map((question) => question.id));
            expect(new Set(ids).size).toBe(ids.length);

            const tie = content.buildTieBreak(config, "tie", Array.from({ length: teamCount }, (_, index) => index));
            expect(tie.questions).toHaveLength(teamCount);
            expect(new Set(tie.questions.map((question) => question.id)).size).toBe(teamCount);
          }
        }
      }
    }
  });
});
