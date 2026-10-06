import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261006090000_052_revoke_unneeded_write_privileges.sql", import.meta.url),
  "utf8",
);
const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration 052 privilege hardening", () => {
  it("documents why, how to apply and how to roll back", () => {
    expect(sql).toMatch(/-- WHY/);
    expect(sql).toMatch(/-- APPLY/);
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toMatch(/grant insert, update, delete, truncate on/);
  });

  it("only revokes write privileges and never touches data or reads", () => {
    expect(statements).not.toMatch(/\b(drop|delete\s+from|insert\s+into|update\s+public|alter\s+table|create\s+policy)\b/i);
    expect(statements).not.toMatch(/revoke[^;]*\bselect\b/i);
    expect(statements).not.toMatch(/revoke\s+all/i);
  });

  it("leaves tables that members and admins write directly alone", () => {
    const revoked = [...statements.matchAll(/revoke[\s\S]*?;/gi)].map((m) => m[0]).join("\n");
    for (const table of ["profiles", "saved_resources", "upgrade_requests", "resources", "requests", "resource_reviews"]) {
      expect(revoked, table).not.toMatch(new RegExp(`public\\.${table}\\b`));
    }
  });

  it("asserts the outcome and aborts the whole migration on a mismatch", () => {
    expect(statements).toMatch(/has_table_privilege/);
    expect(statements).toMatch(/raise exception '052:/);
  });
});
