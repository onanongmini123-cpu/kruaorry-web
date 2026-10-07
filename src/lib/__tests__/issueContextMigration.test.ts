import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTENDED_ISSUE_OPTIONS } from "../resourceIssues";
import { RESOURCE_ISSUE_CONTEXT_READINESS_MARKER } from "../membershipSchemaReadiness";

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);
const ROLLBACK = "supabase/rollbacks/20261006110000_054_resource_issue_context.rollback.sql";
const withoutComments = (text: string) =>
  text.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
const normalize = (text: string) => withoutComments(text).replace(/\s+/g, " ").trim();

const sql = readFileSync(new URL("20261006110000_054_resource_issue_context.sql", MIGRATIONS), "utf8");
const statements = withoutComments(sql);
const rollbackSql = readFileSync(new URL(`../../../${ROLLBACK}`, import.meta.url), "utf8");
const rollback = withoutComments(rollbackSql);
const migration029 = readFileSync(new URL("20260925120000_029_private_requests_reviews_reports.sql", MIGRATIONS), "utf8");

/** `create or replace function public.submit_resource_issue(` … the closing `$$;`. */
function issueFunction(text: string): string {
  const start = text.indexOf("create or replace function public.submit_resource_issue(");
  const end = text.indexOf("\n$$;", start) + "\n$$;".length;
  expect(start).toBeGreaterThan(-1);
  return normalize(text.slice(start, end));
}

describe("migration 054 resource issue context", () => {
  it("documents purpose, compatibility, risk, order, rollback and re-running", () => {
    for (const heading of ["PURPOSE", "FORWARD BEHAVIOUR", "BACKWARD COMPATIBILITY", "DATA RISK", "LOCKING", "DEPLOYMENT ORDER", "ROLLBACK", "RE-RUNNING"]) {
      expect(sql, heading).toContain(`-- ${heading}`);
    }
    expect(sql).toContain("20261006110000_054_resource_issue_context.rollback.sql");
    expect(existsSync(new URL(`../../../${ROLLBACK}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../supabase/verification/054-verify.sql", import.meta.url))).toBe(true);
  });

  it("accepts exactly the categories the application offers", () => {
    const allowed = [...(statements.match(/check \(category in \(([^)]*)\)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual(EXTENDED_ISSUE_OPTIONS.map((option) => option.value).sort());
    const inFunction = [...(statements.match(/if p_category not in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inFunction).toEqual(allowed);
  });

  it("keeps only four short, known context keys and bounds the column", () => {
    for (const key of ["app_version", "browser", "os", "viewport"]) expect(statements).toContain(`'${key}'`);
    expect(statements).not.toMatch(/user_agent|ip_address|email/i);
    expect(statements).toMatch(/pg_column_size\(context\) <= 1024/);
  });

  it("stays callable the old way and publishes the readiness marker last", () => {
    expect(statements).toContain("p_context jsonb default null");
    expect(statements).toMatch(/drop function if exists public\.submit_resource_issue\(uuid, text, text\)/);
    expect(statements).toMatch(/revoke all on function public\.submit_resource_issue\(uuid, text, text, jsonb\) from public, anon/);
    expect(statements.lastIndexOf(RESOURCE_ISSUE_CONTEXT_READINESS_MARKER)).toBeGreaterThan(statements.lastIndexOf("grant execute on function"));
  });

  it("can be applied twice: create or replace, a rebuilt CHECK and an ignored duplicate marker", () => {
    expect(statements).toMatch(/create or replace function public\.submit_resource_issue\(/);
    expect(statements).not.toMatch(/^create function/m);
    expect(statements).toMatch(/on conflict \(id\) do nothing/);
    expect(statements).toMatch(/drop constraint %I/);
  });

  it("never drops data or the table", () => {
    expect(statements).not.toMatch(/drop\s+table|delete\s+from|truncate\s/i);
  });

  it("waits for locks only briefly, before its first statement", () => {
    expect(statements.trim().startsWith("set local lock_timeout = '5s';")).toBe(true);
  });

  describe("rollback file", () => {
    it("runs in one transaction, removes the marker and the 4-argument function first", () => {
      expect(rollback.trim().startsWith("begin;")).toBe(true);
      expect(rollback.trim().endsWith("commit;")).toBe(true);
      expect(rollback).toMatch(/set local lock_timeout = '5s'/);
      expect(rollback).toContain(`delete from public.features where id = '${RESOURCE_ISSUE_CONTEXT_READINESS_MARKER}'`);
      expect(rollback.indexOf("drop function if exists public.submit_resource_issue(uuid, text, text, jsonb)")).toBeGreaterThan(-1);
    });

    it("restores migration 029's function and grants verbatim", () => {
      expect(issueFunction(rollbackSql)).toBe(issueFunction(migration029));
      expect(normalize(rollbackSql)).toContain("revoke all on function public.submit_resource_issue(uuid, text, text) from public, anon; grant execute on function public.submit_resource_issue(uuid, text, text) to authenticated;");
    });

    it("never deletes a report: the widened check and context are kept when new-category reports exist", () => {
      expect(rollback).not.toMatch(/delete\s+from\s+public\.resource_issue_reports/i);
      expect(rollback).toMatch(/if exists \(\s*select 1 from public\.resource_issue_reports\s+where category not in \('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other'\)/);
      expect(rollback).toMatch(/raise notice '054 rollback:/);
    });
  });
});
