import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every request through the API runs with pg_safeupdate loaded
// (authenticator: session_preload_libraries = 'supautils, safeupdate'), which refuses a
// DELETE or UPDATE with no WHERE clause even inside a SECURITY DEFINER function.
// Migration 028 shipped one such statement (hero featured save); 064 fixes it.
const dir = path.join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

function bareWriteStatements(sql: string): string[] {
  const out: string[] = [];
  for (const body of sql.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    for (const stmt of body[1].matchAll(/^\s*(?:delete\s+from|update)\s+[a-z_.]+[^;]*;/gim)) {
      if (!/\bwhere\b/i.test(stmt[0]) && !/\bfrom\s+\(/i.test(stmt[0])) out.push(stmt[0].replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

describe("DELETE / UPDATE inside SQL functions always have a WHERE clause", () => {
  it("no migration function body has a bare DELETE or UPDATE, except the one 064 supersedes", () => {
    const found: string[] = [];
    for (const file of files) {
      for (const stmt of bareWriteStatements(readFileSync(path.join(dir, file), "utf8"))) found.push(`${file}: ${stmt}`);
    }
    expect(found).toEqual(["20260925110000_028_resource_access_featured_benefits.sql: delete from public.featured_resources;"]);
  });

  it("064 redefines set_featured_resources with an explicit WHERE and keeps the checks and privileges", () => {
    const sql = readFileSync(path.join(dir, "20261014100000_064_set_featured_resources_where.sql"), "utf8");
    expect(sql).toContain("delete from public.featured_resources where true;");
    expect(bareWriteStatements(sql)).toEqual([]);
    for (const text of ["is_admin()", "At most five featured resources", "cannot contain duplicates", "must exist and be published", "set search_path = ''"]) expect(sql).toContain(text);
    expect(sql).toContain("revoke all on function public.set_featured_resources(uuid[]) from public, anon;");
    // The refusals all come before the delete, so a rejected list never empties the hero.
    expect(sql.lastIndexOf("must exist and be published")).toBeLessThan(sql.lastIndexOf("delete from public.featured_resources where true"));
  });

  it("the web code reaches the list only through that function (no direct DELETE from the browser)", () => {
    const admin = readFileSync(path.join(process.cwd(), "src/app/admin/page.tsx"), "utf8");
    expect(admin).toContain('supabase.rpc("set_featured_resources"');
    expect(admin).not.toMatch(/from\("featured_resources"\)\s*\.\s*(delete|update|insert)/);
  });
});
