import { readFile } from "node:fs/promises";
import path from "node:path";

export const QUICK_RACE_RESOURCE_ID = "70c9b34d-00d8-4524-b9c5-766b45c7152a";
export const QUICK_RACE_PATH = "/app/games/quick-race";

type QuickRaceBundle = {
  html: string;
  styles: string;
  questions: string;
  app: string;
};

const ASSET_ROOT = path.join(process.cwd(), "src/server/game-assets/quick-race");
let bundlePromise: Promise<QuickRaceBundle> | null = null;

function assertInlineSafe(label: string, source: string, closingTag: string) {
  if (source.toLowerCase().includes(closingTag) || source.includes("<!--")) {
    throw new Error(`${label} contains an unsafe inline breakout sequence`);
  }
}

async function loadQuickRaceBundle(): Promise<QuickRaceBundle> {
  if (!bundlePromise) {
    bundlePromise = Promise.all([
      readFile(path.join(ASSET_ROOT, "index.html"), "utf8"),
      readFile(path.join(ASSET_ROOT, "styles.css"), "utf8"),
      readFile(path.join(ASSET_ROOT, "questions.js"), "utf8"),
      readFile(path.join(ASSET_ROOT, "app.js"), "utf8"),
    ]).then(([html, styles, questions, app]) => {
      assertInlineSafe("styles.css", styles, "</style");
      assertInlineSafe("questions.js", questions, "</script");
      assertInlineSafe("app.js", app, "</script");
      return { html, styles, questions, app };
    }).catch((error) => {
      bundlePromise = null;
      throw error;
    });
  }
  return bundlePromise;
}

export async function renderQuickRaceGame(nonce: string): Promise<string> {
  const { html, styles, questions, app } = await loadQuickRaceBundle();
  const rendered = html
    .replace(
      '<link rel="stylesheet" href="styles.css">',
      `<style nonce="${nonce}">${styles}</style>`,
    )
    .replace(
      '<script src="questions.js"></script>',
      `<script nonce="${nonce}">${questions}</script>`,
    )
    .replace(
      '<script src="app.js"></script>',
      `<script nonce="${nonce}">${app}</script>`,
    );

  if (/\b(?:href|src)=["'](?:styles\.css|questions\.js|app\.js)["']/.test(rendered)) {
    throw new Error("Quick Race bundle was not fully inlined");
  }
  return rendered;
}
