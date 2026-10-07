import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 052 against an isolated engine whose objects start with the
// default Supabase situation (anon and authenticated hold every privilege),
// then proves reads survive, writes are gone, and the migration is idempotent.
// Not a substitute for a Preview-database run before applying to production.
const migration = readFileSync(
  new URL("../supabase/migrations/20261006090000_052_revoke_unneeded_write_privileges.sql", import.meta.url),
  "utf8",
);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table public.plans (id text primary key);
  create table public.features (id text primary key);
  create table public.plan_features (plan_id text, feature_id text);
  create table public.subscriptions (id uuid primary key, user_id uuid);
  create table public.subscription_events (id uuid primary key, user_id uuid);
  create table public.admin_audit_log (id uuid primary key);
  create table public.resources (id uuid primary key, title text);
  create view public.resource_catalog as select id, title from public.resources;
  create view public.plan_benefit_catalog as select id from public.plans;
  create view public.resource_review_feed as select id from public.resources;
  create view public.resource_review_summary as select id from public.resources;
  grant all on all tables in schema public to anon, authenticated;
  create table public.saved_resources (user_id uuid, resource_id uuid);
  grant all on public.saved_resources to authenticated;
`);

async function privilege(role, table, privilege) {
  const { rows } = await db.query("select has_table_privilege($1, $2, $3) as allowed", [role, table, privilege]);
  return rows[0].allowed;
}

for (const run of [1, 2]) {
  await db.exec(migration);
  for (const table of ["resource_catalog", "plan_benefit_catalog", "plans", "features", "plan_features"]) {
    assert.equal(await privilege("anon", `public.${table}`, "select"), true, `run ${run}: anon select ${table}`);
  }
  for (const table of ["resource_review_feed", "resource_review_summary", "subscriptions", "subscription_events"]) {
    assert.equal(await privilege("authenticated", `public.${table}`, "select"), true, `run ${run}: authenticated select ${table}`);
  }
  for (const table of [
    "resource_catalog", "plan_benefit_catalog", "resource_review_feed", "resource_review_summary",
    "subscriptions", "subscription_events", "plans", "features", "plan_features", "admin_audit_log",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      for (const write of ["insert", "update", "delete", "truncate"]) {
        assert.equal(await privilege(role, `public.${table}`, write), false, `run ${run}: ${role} ${write} ${table}`);
      }
    }
  }
}

// Tables members write directly must be untouched.
assert.equal(await privilege("authenticated", "public.saved_resources", "insert"), true);
assert.equal(await privilege("authenticated", "public.saved_resources", "delete"), true);

console.log("migration 052 privilege hardening: ok");
await db.close();
