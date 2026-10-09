// Migration 057 against the real migration chain in local PGlite. This never
// connects to Supabase and uses synthetic rows only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, fromSnapshot, migrationSql, rollbackSql, rows, snapshotOf } from "./lib/real-chain.mjs";

const verification = readFileSync(new URL("../supabase/verification/057-verify.sql", import.meta.url), "utf8");

let passed = 0;
const failures = [];
async function check(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL  ${name}\n        ${String(error?.message ?? error).split("\n").join("\n        ")}`);
  }
}

async function failsWith(promise, pattern, label) {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught?.message ?? caught), pattern, label);
}

async function addUser(db, label, role = "member") {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}@test.invalid`]);
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
  await db.exec("set session_replication_role = origin");
  return id;
}

async function addResource(db, { title, status = "published", accessMode, createdAt }) {
  const id = randomUUID();
  await db.query(`insert into public.resources
    (id, title, delivery_mode, status, access_mode, created_at, cta_url, cover_image_url)
    values ($1, $2, 'web_app', $3, $4, $5, '/qa-resource', '/qa-cover.webp')`, [id, title, status, accessMode, createdAt]);
  return id;
}

async function seed(db) {
  await db.exec("delete from public.resources");
  const admin = await addUser(db, "admin", "admin");
  const member = await addUser(db, "member");

  await addResource(db, { title: "Public Resource", accessMode: "public", createdAt: "2026-10-01T00:00:00Z" });
  await addResource(db, { title: "Member Resource", accessMode: "authenticated", createdAt: "2026-10-02T00:00:00Z" });
  await addResource(db, { title: "Locked Resource", accessMode: "locked", createdAt: "2026-10-03T00:00:00Z" });
  const orphan = await addResource(db, { title: "Orphan Pro Resource", accessMode: "plans", createdAt: "2026-10-04T00:00:00Z" });

  const teacherResources = [];
  for (let index = 1; index <= 6; index += 1) {
    teacherResources.push(await addResource(db, {
      title: `Teacher Resource ${index}`,
      accessMode: "plans",
      createdAt: `2026-10-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
    }));
  }
  const founderOnly = await addResource(db, { title: "Founder Resource", accessMode: "plans", createdAt: "2026-10-20T00:00:00Z" });
  const draft = await addResource(db, { title: "Draft Pro Resource", status: "draft", accessMode: "plans", createdAt: "2026-10-21T00:00:00Z" });
  const archived = await addResource(db, { title: "Archived Pro Resource", status: "archived", accessMode: "plans", createdAt: "2026-10-22T00:00:00Z" });

  // The legacy compatibility trigger assigns all premium plans when a plans
  // resource is inserted. Replace that with the exact synthetic matrix under
  // test, leaving the orphan deliberately unassigned.
  await db.query("delete from public.resource_plan_access where resource_id = any($1::uuid[])", [[orphan, ...teacherResources, founderOnly, draft, archived]]);
  for (const resourceId of teacherResources) {
    await db.query("insert into public.resource_plan_access (resource_id, plan_id) values ($1, 'teacher')", [resourceId]);
  }
  await db.query("insert into public.resource_plan_access (resource_id, plan_id) values ($1, 'founder')", [teacherResources[5]]);
  await db.query("insert into public.resource_plan_access (resource_id, plan_id) values ($1, 'founder')", [founderOnly]);
  await db.query("insert into public.resource_plan_access (resource_id, plan_id) values ($1, 'teacher')", [draft]);
  await db.query("insert into public.resource_plan_access (resource_id, plan_id) values ($1, 'teacher')", [archived]);

  return { admin, member };
}

function normalizedResult(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function call(db, userId) {
  const result = await asRole(db, "authenticated", userId, async () => (
    await rows(db, "select public.get_admin_plan_resource_summary() as result")
  ));
  return normalizedResult(result[0].result);
}

console.log("replaying migrations 001..056 …");
const baseDb = await chainDb("056");
const baseSnapshot = await snapshotOf(baseDb);
await baseDb.close();

async function withDb(run, { apply = true } = {}) {
  const db = await fromSnapshot(baseSnapshot);
  try {
    if (apply) await db.exec(migrationSql("057"));
    return await run(db);
  } finally {
    await db.close();
  }
}

await check("057 verification returns 9/9 true and re-apply is idempotent", async () => {
  await withDb(async (db) => {
    assert.equal((await rows(db, verification)).filter((row) => row.ok === true).length, 9);
    await db.exec(migrationSql("057"));
    assert.equal((await rows(db, verification)).filter((row) => row.ok === true).length, 9);
  });
});

await check("admin can call while member and anon are rejected", async () => {
  await withDb(async (db) => {
    const { admin, member } = await seed(db);
    assert.ok(await call(db, admin));
    await failsWith(call(db, member), /Admin access required|42501/, "member admin gate");
    await failsWith(asRole(db, "anon", null, () => rows(db, "select public.get_admin_plan_resource_summary()")), /permission denied/i, "anon execute privilege");
  });
});

await check("all access modes, plan coverage and latest-five ordering use exact published fixtures", async () => {
  await withDb(async (db) => {
    const { admin } = await seed(db);
    const result = await call(db, admin);
    assert.deepEqual(result.access_counts, { free: 1, member: 1, pro: 8, locked: 1, total: 11 });
    const teacher = result.plans.find((plan) => plan.plan_id === "teacher");
    const founder = result.plans.find((plan) => plan.plan_id === "founder");
    assert.equal(teacher.resource_count, 6);
    assert.deepEqual(teacher.latest_resources, [
      "Teacher Resource 6", "Teacher Resource 5", "Teacher Resource 4", "Teacher Resource 3", "Teacher Resource 2",
    ]);
    assert.equal(founder.resource_count, 2);
    assert.deepEqual(founder.latest_resources, ["Founder Resource", "Teacher Resource 6"]);
    assert.deepEqual(result.unassigned_plan_resources, { count: 1, resources: ["Orphan Pro Resource"] });
    assert.doesNotMatch(JSON.stringify(result), /Draft Pro Resource|Archived Pro Resource/);
  });
});

await check("result contains no member identity and the call writes nothing", async () => {
  await withDb(async (db) => {
    const { admin } = await seed(db);
    const before = await rows(db, `select
      (select count(*) from public.resources)::int resources,
      (select count(*) from public.resource_plan_access)::int resource_plan_access,
      (select count(*) from public.plans)::int plans`);
    const result = await call(db, admin);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /@test\.invalid|user_id|full_name|email|profile|subscription/i);
    assert.deepEqual(await rows(db, `select
      (select count(*) from public.resources)::int resources,
      (select count(*) from public.resource_plan_access)::int resource_plan_access,
      (select count(*) from public.plans)::int plans`), before);
  });
});

await check("rollback removes only the RPC and a re-apply restores it", async () => {
  await withDb(async (db) => {
    await db.exec(rollbackSql("057"));
    assert.equal((await rows(db, "select to_regprocedure('public.get_admin_plan_resource_summary()') as fn"))[0].fn, null);
    await db.exec(migrationSql("057"));
    assert.equal((await rows(db, verification)).filter((row) => row.ok === true).length, 9);
  });
});

await check("migration guard refuses a partial unexpected overload", async () => {
  await withDb(async (db) => {
    await db.exec("create function public.get_admin_plan_resource_summary(integer) returns jsonb language sql as 'select ''{}''::jsonb'");
    await failsWith(db.exec(migrationSql("057")), /unexpected overload/, "partial-state guard");
  }, { apply: false });
});

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
