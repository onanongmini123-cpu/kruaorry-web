import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidSlug } from "../resourceSlug";

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);
const MIGRATION = "20261006100000_053_resource_slugs.sql";
const ROLLBACK = "supabase/rollbacks/20261006100000_053_resource_slugs.rollback.sql";
const read = (relative: string) => readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
const withoutComments = (text: string) =>
  text.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
const normalize = (text: string) => withoutComments(text).replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const sql = readFileSync(new URL(MIGRATION, MIGRATIONS), "utf8");
const statements = withoutComments(sql);
const rollbackSql = read(ROLLBACK);
const rollback = withoutComments(rollbackSql);
const migrationFiles = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
const migration029 = readFileSync(new URL("20260925120000_029_private_requests_reviews_reports.sql", MIGRATIONS), "utf8");

/** The `create or replace view public.resource_catalog … ;` statement of a file. */
function catalogueView(text: string): string {
  const start = text.indexOf("create or replace view public.resource_catalog");
  const where = text.indexOf("where r.status = 'published'", start);
  const end = text.indexOf("\n  );", where) + "\n  );".length;
  expect(start).toBeGreaterThan(-1);
  expect(where).toBeGreaterThan(start);
  return normalize(text.slice(start, end));
}

describe("migration 053 resource slugs", () => {
  it("documents purpose, rollout order, compatibility, collisions, locking, data risk and rollback", () => {
    for (const heading of ["PURPOSE", "TWO-STAGE ROLLOUT", "FORWARD BEHAVIOUR", "BACKWARD COMPATIBILITY", "COLLISIONS", "LOCKING", "DATA RISK", "DEPLOYMENT ORDER", "ROLLBACK"]) {
      expect(sql, heading).toContain(`-- ${heading}`);
    }
    expect(sql).toContain("20261006100000_053_resource_slugs.rollback.sql");
    expect(existsSync(new URL(`../../../${ROLLBACK}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../supabase/verification/053-verify.sql", import.meta.url))).toBe(true);
  });

  it("is additive: no drops, deletes or primary-key changes in the executable statements", () => {
    expect(statements).not.toMatch(/\b(drop\s+(table|column|index|constraint|view)|delete\s+from|truncate\s+table|alter\s+table[^;]*\bdrop\b|rename\s+to|primary\s+key)\b/i);
    expect(statements).toMatch(/add column if not exists slug text/i);
    expect(statements).toMatch(/create unique index if not exists resources_slug_key/i);
  });

  it("waits for locks only briefly instead of queueing every reader behind it", () => {
    expect(statements).toMatch(/set local lock_timeout = '5s'/);
  });

  it("keeps the slug rules identical to the application's", () => {
    expect(statements).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(statements).toContain("between 3 and 80");
    // UUID-shaped slugs are refused, matching isValidSlug.
    expect(statements).toMatch(/slug !~ '\^\[0-9a-f\]\{8\}-/);
  });

  describe("backfill", () => {
    const rows = [...statements.matchAll(/\('([0-9a-f-]{36})'::uuid, '([a-z0-9-]+)'\)/g)].map((m) => ({ id: m[1], slug: m[2] }));

    it("is an explicit list keyed by resource id with valid, unique slugs", () => {
      expect(rows.length).toBe(17);
      expect(rows.every((row) => isValidSlug(row.slug))).toBe(true);
      expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
      expect(statements).toMatch(/where r\.id = m\.id/);
    });

    it("never overwrites a slug that is set and never takes one that is in use", () => {
      expect(statements).toMatch(/and r\.slug is null/);
      expect(statements).toMatch(/not exists \(select 1 from public\.resources o where o\.slug = m\.slug\)/);
    });

    it("names ids that exist in exactly one seed migration each (a typo would silently skip a resource)", () => {
      const seeds = migrationFiles.filter((file) => /_0(3[1-9]|4[0-7])_/.test(file));
      for (const { id } of rows) {
        const hits = seeds.filter((file) => readFileSync(new URL(file, MIGRATIONS), "utf8").includes(id));
        expect(hits.length, id).toBe(1);
      }
    });
  });

  it("does not open the base table's slug column to browser roles (the catalogue view is the only reader)", () => {
    expect(statements).not.toMatch(/grant\s+select\s*\(\s*slug/i);
    expect(statements).not.toMatch(/grant[^;]*on\s+public\.resources\b/i);
  });

  describe("catalogue view", () => {
    it("is migration 029's definition plus slug as the last column, nothing else", () => {
      const before = catalogueView(migration029);
      const after = catalogueView(sql);
      expect(after.replace(", r.slug from public.resources r", " from public.resources r")).toBe(before);
      expect(after).toMatch(/review_stats\.review_count, r\.slug from public\.resources r/);
    });

    it("is still the latest definition: no migration between 029 and 053 redefines the view", () => {
      const between = migrationFiles.filter((file) => {
        const number = Number(/_(\d{3})[a-z]?_/.exec(file)?.[1] ?? "0");
        return number > 29 && number < 53;
      });
      expect(between.length).toBeGreaterThan(10);
      for (const file of between) {
        expect(readFileSync(new URL(file, MIGRATIONS), "utf8"), file).not.toMatch(/create (or replace )?view public\.resource_catalog/);
      }
    });

    it("keeps the view read-only for browser roles and refuses an unexpected live view before changing anything", () => {
      expect(statements).toMatch(/revoke insert, update, delete, truncate on public\.resource_catalog from anon, authenticated/);
      expect(statements).toMatch(/raise exception '053: public\.resource_catalog has columns/);
      expect(statements).toMatch(/raise exception '053: public\.resource_catalog is not a security_barrier view/);
      expect(statements.indexOf("raise exception '053: public.resource_catalog has columns")).toBeLessThan(statements.indexOf("add column if not exists slug"));
    });
  });

  describe("rollback file", () => {
    it("runs in one transaction with a lock timeout", () => {
      expect(rollback.trim().startsWith("begin;")).toBe(true);
      expect(rollback.trim().endsWith("commit;")).toBe(true);
      expect(rollback).toMatch(/set local lock_timeout = '5s'/);
    });

    it("keeps the view (never drops it: saved_resources policies depend on it) and exposes slug as NULL", () => {
      expect(rollback).not.toMatch(/drop\s+view/i);
      const before = catalogueView(migration029);
      const after = catalogueView(rollbackSql);
      expect(after.replace(", null::text as slug from public.resources r", " from public.resources r")).toBe(before);
      expect(after).toMatch(/review_stats\.review_count, null::text as slug from public\.resources r/);
    });

    it("replaces the view before it drops the column it used to read", () => {
      const replace = rollback.indexOf("create or replace view public.resource_catalog");
      const dropIndex = rollback.indexOf("drop index if exists public.resources_slug_key");
      const dropConstraint = rollback.indexOf("drop constraint if exists resources_slug_format");
      const dropColumn = rollback.indexOf("drop column if exists slug");
      expect(replace).toBeGreaterThan(-1);
      expect(dropIndex).toBeGreaterThan(replace);
      expect(dropConstraint).toBeGreaterThan(replace);
      expect(dropColumn).toBeGreaterThan(replace);
    });
  });
});
