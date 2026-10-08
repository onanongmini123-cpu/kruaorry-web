import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidSlug } from "../resourceSlug";
import slugCorpus from "./fixtures/slug-corpus.json";

const MIGRATIONS = "supabase/migrations/";
const MIGRATION = `${MIGRATIONS}20261008090000_055_admin_save_resource_slug.sql`;
const ROLLBACK = "supabase/rollbacks/20261008090000_055_admin_save_resource_slug.rollback.sql";
const VERIFY = "supabase/verification/055-verify.sql";
const M028 = `${MIGRATIONS}20260925110000_028_resource_access_featured_benefits.sql`;

const read = (relative: string) => readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
const withoutComments = (text: string) => text.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

const sql = read(MIGRATION);
const executable = withoutComments(sql);
const rollbackSql = read(ROLLBACK);
const migration028 = read(M028);

/** The text with every dollar-quoted body (function bodies, DO blocks) collapsed. */
const withoutBodies = (text: string) => text.replace(/\$\$[\s\S]*?\$\$/g, () => "$$…$$");

/** The `create or replace function public.admin_save_resource( … $$;` statement of a file. */
function saveFunction(text: string): string {
  const start = text.indexOf("create or replace function public.admin_save_resource(");
  expect(start).toBeGreaterThan(-1);
  const bodyStart = text.indexOf("as $$", start);
  const end = text.indexOf("$$;", bodyStart) + "$$;".length;
  expect(end).toBeGreaterThan(bodyStart);
  return text.slice(start, end);
}

/** Lines compared across versions: indentation, trailing commas and the slug additions ignored. */
const canon = (line: string) => line.trim().replace(/,\s*(v_)?slug\b/, "").replace(/,$/, "");
const significant = (text: string) => text.split("\n").map(canon).filter((line) => line && !line.startsWith("--"));

describe("migration 055 admin_save_resource slug", () => {
  it("documents purpose, behaviour, security, compatibility, locking, data risk, order and rollback", () => {
    for (const heading of ["PURPOSE", "FORWARD BEHAVIOUR", "SECURITY", "BACKWARD COMPATIBILITY", "LOCKING", "DATA RISK", "DEPLOYMENT ORDER", "ROLLBACK"]) {
      expect(sql, heading).toContain(`-- ${heading}`);
    }
    expect(sql).toContain("20261008090000_055_admin_save_resource_slug.rollback.sql");
    expect(sql).toContain("055-verify.sql");
    for (const file of [ROLLBACK, VERIFY, "scripts/test-admin-save-resource-slug-sql.mjs"]) {
      expect(existsSync(new URL(`../../../${file}`, import.meta.url)), file).toBe(true);
    }
  });

  it("only replaces the function and grants authenticated read access to slug; no schema or data changes", () => {
    const outside = withoutBodies(executable);
    expect(outside).not.toMatch(/\b(alter\s+table|create\s+table|drop\s+table|drop\s+column|create\s+index|drop\s+index|create\s+policy|drop\s+policy|truncate|delete\s+from|insert\s+into|update\s+public)\b/i);
    expect(outside).toMatch(/set local lock_timeout = '5s'/);
    const statements = outside.split(";").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement, statement.slice(0, 60)).toMatch(/^(set local|do\s+\$\$|drop function if exists public\.admin_save_resource|create or replace function public\.admin_save_resource|revoke all on function public\.admin_save_resource|grant execute on function public\.admin_save_resource|revoke select \(slug\) on public\.resources|grant select \(slug\) on public\.resources|\$\$)/);
    }
  });

  it("replaces the 16-argument function in the same transaction so no overload is left behind", () => {
    expect(executable).toMatch(/drop function if exists public\.admin_save_resource\(\s*uuid, boolean, text, text, text, text, text\[\], text, text, text,\s*text, text, bigint, text, text, text\[\]\s*\);/);
    expect(executable).toMatch(/p_plan_ids text\[\],\s*p_slug text default null\s*\)/);
    expect(executable.indexOf("drop function if exists")).toBeLessThan(executable.indexOf("create or replace function"));
  });

  it("stays SECURITY DEFINER with an empty search_path and the admin gate before any data access", () => {
    const fn = saveFunction(sql);
    expect(fn).toMatch(/language plpgsql\s+security definer\s+set search_path = ''/);
    expect(fn.indexOf("public.is_admin()")).toBeGreaterThan(-1);
    expect(fn.indexOf("public.is_admin()")).toBeLessThan(fn.indexOf("public.resources"));
    expect(fn).toContain("errcode = '42501'");
    // Every table the body touches is schema-qualified.
    const body = fn.slice(fn.indexOf("as $$"));
    expect(body).not.toMatch(/\b(from|into|update|join)\s+(?!public\.|\(|pg_temp|unnest)[a-z_]+\b(?<!\bselect)/i);
  });

  it("grants function EXECUTE and slug SELECT only to authenticated", () => {
    const args = String.raw`\(\s*uuid, boolean, text, text, text, text, text\[\], text, text, text,\s*text, text, bigint, text, text, text\[\], text\s*\)`;
    expect(executable).toMatch(new RegExp(`revoke all on function public\\.admin_save_resource${args}\\s+from public, anon;`));
    expect(executable).toMatch(new RegExp(`grant execute on function public\\.admin_save_resource${args}\\s+to authenticated;`));
    expect(executable).toMatch(/revoke select \(slug\) on public\.resources from public, anon;/);
    expect(executable).toMatch(/grant select \(slug\) on public\.resources to authenticated;/);
    expect(executable.match(/\bgrant\b/gi)).toHaveLength(2);
  });

  it("guards the target database before writing anything", () => {
    expect(executable).toContain("Apply migration 053 first");
    expect(executable).toMatch(/expected exactly one public\.admin_save_resource/);
    expect(executable).toMatch(/signature this file does not recognise/);
    expect(executable.indexOf("Apply migration 053 first")).toBeLessThan(executable.indexOf("drop function if exists"));
  });

  it("keeps every line of migration 028's function and only adds the slug handling", () => {
    const before = significant(saveFunction(migration028));
    const after = significant(saveFunction(sql));
    let cursor = 0;
    const missing: string[] = [];
    for (const line of before) {
      const found = after.indexOf(line, cursor);
      if (found === -1) missing.push(line);
      else cursor = found + 1;
    }
    expect(missing, `lines of 028 missing or reordered in 055:\n${missing.join("\n")}`).toEqual([]);
  });

  it("applies the same slug rules as the column constraint and the application", () => {
    const fn = saveFunction(sql);
    expect(fn).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(fn).toContain("not between 3 and 80");
    expect(fn).toContain("'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'");
    expect(fn).toContain("raise exception 'Resource slug is invalid' using errcode = '22023'");
    expect(fn).toContain("raise exception 'Resource slug is already in use' using errcode = '23505'");
    // Same strings as the column constraint (the SQL script checks the function itself against this corpus).
    for (const slug of slugCorpus.valid) expect(isValidSlug(slug), slug).toBe(true);
    for (const slug of slugCorpus.invalid) expect(isValidSlug(slug), JSON.stringify(slug)).toBe(false);
  });

  it("treats null and blank as 'no change' and never clears a slug", () => {
    const fn = saveFunction(sql);
    expect(fn).toContain("v_slug text := nullif(btrim(coalesce(p_slug, '')), '');");
    expect(fn).toContain("slug = coalesce(v_slug, slug)");
    expect(fn).toMatch(/get stacked diagnostics v_constraint = constraint_name;\s+if v_constraint = 'resources_slug_key'/);
  });
});

describe("rollback for migration 055", () => {
  it("restores migration 028's function text and grants byte for byte, in one transaction", () => {
    expect(rollbackSql).toMatch(/^begin;/m);
    expect(rollbackSql.trim().endsWith("commit;")).toBe(true);
    expect(saveFunction(rollbackSql)).toBe(saveFunction(migration028));
    const grants = (text: string) => {
      const start = text.indexOf("revoke all on function public.admin_save_resource(");
      const tail = text.slice(start);
      const endMarker = ") to authenticated;";
      const end = tail.indexOf(endMarker) + endMarker.length;
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(endMarker.length - 1);
      return tail.slice(0, end);
    };
    expect(grants(rollbackSql)).toBe(grants(migration028));
  });

  it("drops the 17-argument function before restoring the old one and touches no data", () => {
    const executable = withoutComments(rollbackSql);
    expect(executable.indexOf("drop function if exists public.admin_save_resource(")).toBeLessThan(executable.indexOf("create or replace function"));
    expect(withoutBodies(executable)).not.toMatch(/\b(alter\s+table|drop\s+table|delete\s+from|truncate|update\s+public|insert\s+into)\b/i);
    expect(executable).toContain("revoke select (slug) on public.resources from authenticated;");
  });
});

describe("verification for migration 055", () => {
  const verify = read(VERIFY);
  it("is read-only and reports every property the migration promises", () => {
    expect(withoutComments(verify)).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
    for (const topic of ["no overload", "17 arguments", "SECURITY DEFINER", "EXECUTE", "admin gate", "053", "resources.slug"]) {
      expect(verify, topic).toContain(topic);
    }
  });
});
