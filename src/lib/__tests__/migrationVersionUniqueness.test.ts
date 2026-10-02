import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_FILENAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

function migrationFiles(): string[] {
  return readdirSync(join(process.cwd(), "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("Supabase migration version ledger", () => {
  it("uses a parseable timestamp prefix for every SQL migration", () => {
    const invalid = migrationFiles().filter((name) => !MIGRATION_FILENAME.test(name));
    expect(invalid, `invalid migration filenames: ${invalid.join(", ")}`).toEqual([]);
  });

  it("never assigns the same migration version to two files", () => {
    const filesByVersion = new Map<string, string[]>();
    for (const name of migrationFiles()) {
      const match = MIGRATION_FILENAME.exec(name);
      if (!match) continue;
      const [, version] = match;
      filesByVersion.set(version, [...(filesByVersion.get(version) ?? []), name]);
    }

    const duplicates = [...filesByVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${names.join(", ")}`);

    expect(duplicates, `duplicate Supabase migration versions:\n${duplicates.join("\n")}`).toEqual([]);
  });
});
