import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidSlug } from "../resourceSlug";

const sql = readFileSync(new URL("../../../supabase/migrations/20261006100000_053_resource_slugs.sql", import.meta.url), "utf8");
const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

describe("migration 053 resource slugs", () => {
  it("documents purpose, rollout order, compatibility, data risk and rollback", () => {
    for (const heading of ["PURPOSE", "TWO-STAGE ROLLOUT", "FORWARD BEHAVIOUR", "BACKWARD COMPATIBILITY", "COLLISIONS", "DATA RISK", "DEPLOYMENT ORDER", "ROLLBACK"]) {
      expect(sql, heading).toContain(`-- ${heading}`);
    }
  });

  it("is additive: no drops, deletes or primary-key changes in the executable statements", () => {
    expect(statements).not.toMatch(/\b(drop\s+(table|column|index|constraint)|delete\s+from|truncate\s+table|alter\s+table[^;]*\bdrop\b|rename\s+to|primary\s+key)\b/i);
    expect(statements).toMatch(/add column if not exists slug text/i);
    expect(statements).toMatch(/create unique index if not exists resources_slug_key/i);
  });

  it("keeps the slug rules identical to the application's", () => {
    expect(statements).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(statements).toContain("between 3 and 80");
    // UUID-shaped slugs are refused, matching isValidSlug.
    expect(statements).toMatch(/slug !~ '\^\[0-9a-f\]\{8\}-/);
  });

  it("only backfills explicit, valid, unique slugs and never overwrites one", () => {
    const rows = [...statements.matchAll(/\('([^']+)', '([a-z0-9-]+)'\)/g)].map((m) => ({ title: m[1], slug: m[2] }));
    expect(rows.length).toBeGreaterThanOrEqual(17);
    expect(rows.every((row) => isValidSlug(row.slug))).toBe(true);
    expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.title)).size).toBe(rows.length);
    expect(statements).toMatch(/where r\.slug is null/);
    expect(statements).toMatch(/not exists \(select 1 from public\.resources o where o\.slug = m\.slug\)/);
  });

  it("adds slug as the last catalogue column and keeps the view read-only", () => {
    expect(statements).toMatch(/review_stats\.review_count,\s*r\.slug\s*from public\.resources r/);
    expect(statements).toMatch(/revoke insert, update, delete, truncate on public\.resource_catalog from anon, authenticated/);
  });
});
