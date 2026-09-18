import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// This repo has no local/CI Postgres and no migration-execution harness —
// `npm test` is Vitest over plain TypeScript (see vitest.config.mts:
// include is "src/**/*.test.ts" only). Proving the actual concurrency fix
// (two real transactions racing on pg_advisory_xact_lock) would require
// standing up a live Postgres instance and driving genuinely concurrent
// sessions against it, which is out of scope for "keep the change
// minimal" here and isn't something any other migration in this repo has
// infrastructure for either. What IS practical, and exactly targets the
// bug class this migration fixes, is a static check on the SQL text
// itself: the fix is only correct if both trigger functions acquire the
// *same* advisory lock key *before* their last-owner exists-check — a
// typo'd or reordered edit later would silently reopen the race without
// necessarily breaking anything else, so that's what this guards against.
const MIGRATION_PATH = path.resolve(import.meta.dirname, "../../../supabase/migrations/20260901000000_017_serialize_owner_role_transitions.sql");

function functionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function public.${functionName}()`);
  if (start === -1) throw new Error(`function ${functionName} not found in migration`);
  const end = sql.indexOf("$$;", start);
  if (end === -1) throw new Error(`unterminated function body for ${functionName}`);
  return sql.slice(start, end);
}

function lockKeyArgument(functionSql: string): string {
  const match = functionSql.match(/pg_advisory_xact_lock\(([^)]+)\)/);
  if (!match) throw new Error("pg_advisory_xact_lock(...) call not found");
  return match[1].trim();
}

describe("017_serialize_owner_role_transitions migration (static SQL checks)", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf-8");
  const demoteFn = functionBody(sql, "prevent_self_privilege_escalation");
  const deleteFn = functionBody(sql, "prevent_last_owner_delete");

  it("both trigger functions acquire an advisory lock", () => {
    expect(demoteFn).toContain("pg_advisory_xact_lock(");
    expect(deleteFn).toContain("pg_advisory_xact_lock(");
  });

  it("both trigger functions use the exact same lock key — a mismatch here silently reopens the race", () => {
    const demoteKey = lockKeyArgument(demoteFn);
    const deleteKey = lockKeyArgument(deleteFn);
    expect(demoteKey).toBe(deleteKey);
    // Guard against both being empty/whitespace matching each other trivially.
    expect(demoteKey.length).toBeGreaterThan(0);
  });

  it("each function acquires the lock before running its last-owner exists-check, not after", () => {
    for (const fn of [demoteFn, deleteFn]) {
      const lockIndex = fn.indexOf("pg_advisory_xact_lock(");
      const checkIndex = fn.indexOf("not exists (select 1 from public.profiles where role = 'owner'");
      expect(lockIndex).toBeGreaterThan(-1);
      expect(checkIndex).toBeGreaterThan(-1);
      expect(lockIndex).toBeLessThan(checkIndex);
    }
  });

  it("both functions remain SECURITY DEFINER with a locked-down search_path (unchanged from the original migration)", () => {
    for (const fn of [demoteFn, deleteFn]) {
      expect(fn).toContain("security definer");
      expect(fn).toContain("set search_path = public");
    }
  });

  it("role/plan authorization semantics are untouched: is_owner()/is_admin() pin-back logic still present verbatim", () => {
    expect(demoteFn).toContain("if new.role is distinct from old.role and not public.is_owner() then");
    expect(demoteFn).toContain("new.role := old.role;");
    expect(demoteFn).toContain("if new.plan is distinct from old.plan and not public.is_admin() then");
    expect(demoteFn).toContain("new.plan := old.plan;");
  });
});
