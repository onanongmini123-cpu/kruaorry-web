import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

describe("bank account stays on the server", () => {
  it("no NEXT_PUBLIC_ variable carries bank details", () => {
    const hits = files.filter((f) => /NEXT_PUBLIC_BANK/.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits).toEqual([]);
  });

  it("only the server-side config reader touches the BANK_* variables", () => {
    const hits = files.filter((f) => /BANK_(NAME|ACCOUNT_NUMBER|ACCOUNT_NAME)/.test(readFileSync(f, "utf8"))).map(rel).sort();
    expect(hits).toEqual(["app/api/membership/bank-account/route.ts", "lib/bankAccount.ts"]);
  });

  it("the config reader is imported only by the route handler, never by a client component", () => {
    const importers = files.filter((f) => /from "@\/lib\/bankAccount"/.test(readFileSync(f, "utf8"))).map(rel).sort();
    expect(importers).toEqual(["app/api/membership/bank-account/route.ts"]);
  });

  it("the page and its client files never read the bank environment", () => {
    const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    for (const f of clientFiles) expect(readFileSync(f, "utf8")).not.toMatch(/process\.env\.BANK_/);
  });
});
