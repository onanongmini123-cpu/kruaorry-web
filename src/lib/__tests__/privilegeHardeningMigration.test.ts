import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261006090000_052_revoke_unneeded_write_privileges.sql";
const ROLLBACK = "supabase/rollbacks/20261006090000_052_revoke_unneeded_write_privileges.rollback.sql";
const VERIFY = "supabase/verification/052-verify.sql";
const read = (relative: string) => readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
const withoutComments = (text: string) =>
  text.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

const sql = read(MIGRATION);
const statements = withoutComments(sql);
const rollback = withoutComments(read(ROLLBACK));

const relationsIn = (list: string) =>
  list.split(",").map((name) => name.trim().replace(/^public\./, "")).filter(Boolean).sort();

/** Every relation named in the revoke statements of the migration. */
const revokedRelations = [...statements.matchAll(/revoke insert, update, delete, truncate on\s+([\s\S]*?)\s+from public, anon, authenticated;/g)]
  .flatMap((match) => relationsIn(match[1]))
  .sort();

describe("migration 052 privilege hardening", () => {
  it("documents why, how to apply and how to roll back, and points at files that exist", () => {
    expect(sql).toMatch(/-- WHY/);
    expect(sql).toMatch(/-- APPLY/);
    expect(sql).toMatch(/-- ROLLBACK/);
    expect(sql).toContain(ROLLBACK.split("/").pop());
    expect(existsSync(new URL(`../../../${ROLLBACK}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`../../../${VERIFY}`, import.meta.url))).toBe(true);
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

  it("checks, at the end, exactly the objects it revoked from", () => {
    const checked = [...(sql.match(/-- No browser role may keep a write privilege[\s\S]*?end\s*\$\$;/)?.[0] ?? "").matchAll(/'public\.([a-z_]+)'/g)]
      .map((match) => match[1])
      .sort();
    expect(revokedRelations.length).toBe(10);
    expect(checked).toEqual(revokedRelations);
  });

  it("has a rollback that grants back exactly what the migration revoked, in one transaction", () => {
    const granted = [...rollback.matchAll(/grant insert, update, delete, truncate on\s+([\s\S]*?)\s+to anon, authenticated;/g)]
      .flatMap((match) => relationsIn(match[1]))
      .sort();
    expect(granted).toEqual(revokedRelations);
    expect(rollback.trim().startsWith("begin;")).toBe(true);
    expect(rollback.trim().endsWith("commit;")).toBe(true);
    expect(rollback).not.toMatch(/\b(drop|delete\s+from|truncate\s+table|insert\s+into|alter\s+table|create\s+policy)\b/i);
  });
});
