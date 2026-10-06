import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTENDED_ISSUE_OPTIONS } from "../resourceIssues";
import { RESOURCE_ISSUE_CONTEXT_READINESS_MARKER } from "../membershipSchemaReadiness";

const sql = readFileSync(new URL("../../../supabase/migrations/20261006110000_054_resource_issue_context.sql", import.meta.url), "utf8");
const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

describe("migration 054 resource issue context", () => {
  it("documents purpose, compatibility, risk, order and rollback", () => {
    for (const heading of ["PURPOSE", "FORWARD BEHAVIOUR", "BACKWARD COMPATIBILITY", "DATA RISK", "DEPLOYMENT ORDER", "ROLLBACK"]) {
      expect(sql, heading).toContain(`-- ${heading}`);
    }
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

  it("never drops data or the table", () => {
    expect(statements).not.toMatch(/drop\s+table|delete\s+from|truncate\s/i);
  });
});
