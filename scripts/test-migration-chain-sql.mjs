// End-to-end check of migrations 052, 053 and 054 against the REAL migration
// chain: supabase/migrations/001..051 are replayed in-process by PGlite (real
// PostgreSQL compiled to WebAssembly) with Supabase-like roles and default
// privileges, instead of a hand-built stand-in schema. Local only: this script
// never connects to a remote database and needs no credentials.
//
//   npm run test:migration-chain-sql
//
// What it proves
//   * forward result of each migration, alone and after the other two
//   * every apply order gives the same final state; each re-run changes nothing
//   * the guards stop a wrong database before anything is written
//   * behaviour as the browser roles (anon / authenticated) and as members
//   * hostile production-shaped data (edited titles, duplicate titles, taken
//     slugs, old reports, drifted constraint names)
//   * the rollback files in supabase/rollbacks restore the previous state
//   * the read-only SQL in supabase/verification (used by docs/pr-27-handoff.md)
//     really separates "not applied" from "applied"
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, fromSnapshot, migrationSql, rollbackSql, rows, snapshotOf } from "./lib/real-chain.mjs";

const verificationDir = new URL("../supabase/verification/", import.meta.url);
const verification = (name) => readFileSync(new URL(`${name}.sql`, verificationDir), "utf8");
const slugCorpus = JSON.parse(
  readFileSync(new URL("../src/lib/__tests__/fixtures/slug-corpus.json", import.meta.url), "utf8"),
);

const TEN_RELATIONS = [
  "resource_catalog", "plan_benefit_catalog", "resource_review_feed", "resource_review_summary",
  "subscriptions", "subscription_events", "plans", "features", "plan_features", "admin_audit_log",
];
const SEEDED_SLUG_COUNT = 17;
const OLD_CATEGORIES = ["cannot_open", "broken_link", "cannot_download", "wrong_content", "other"];
const NEW_CATEGORIES = ["wrong_answer", "cannot_play", "no_sound", "camera_issue", "mobile_layout"];
const MARKER = "system.resource_issue_context_v1_ready";

// ---------------------------------------------------------------- harness

let passed = 0;
const failures = [];

async function check(name, run) {
  const started = Date.now();
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}  (${Date.now() - started} ms)`);
  } catch (error) {
    failures.push(name);
    const detail = String(error?.message ?? error).split("\n").map((line) => `        ${line}`).join("\n");
    console.log(`FAIL  ${name}\n${detail}`);
  }
}

console.log("replaying migrations 001..051 …");
const baseStarted = Date.now();
const baseDb = await chainDb("051");
const baseSnapshot = await snapshotOf(baseDb);
await baseDb.close();
console.log(`baseline ready in ${Date.now() - baseStarted} ms\n`);

/** A private copy of the baseline database, with the listed migrations applied. */
async function withDb(run, { apply = [] } = {}) {
  const db = await fromSnapshot(baseSnapshot);
  try {
    for (const number of apply) await db.exec(migrationSql(number));
    return await run(db);
  } finally {
    await db.close();
  }
}

const message = (error) => String(error?.message ?? error).split("\n")[0];

async function failsWith(promise, pattern, label) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: expected an error but the statement succeeded`);
  assert.match(String(caught.message ?? caught), pattern, `${label}: unexpected error "${message(caught)}"`);
  return caught;
}

// -------------------------------------------------------- state fingerprint

/** Everything a migration in this PR could touch, in a deterministic shape. */
async function fingerprint(db) {
  const fp = {};
  fp.relations = await rows(db, `
    select c.relname, c.relkind,
      coalesce((select array_agg(a.grantee || ':' || a.priv order by a.grantee, a.priv) from (
        select coalesce(r.rolname, 'PUBLIC') as grantee, x.privilege_type as priv
        from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
        left join pg_roles r on r.oid = x.grantee
      ) a), '{}') as acl,
      c.reloptions::text as reloptions,
      pg_get_userbyid(c.relowner) as owner,
      c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
      case when c.relkind = 'v' then pg_get_viewdef(c.oid, true) end as viewdef
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    order by c.relname`);
  fp.columns = await rows(db, `
    select c.relname, row_number() over (partition by c.relname order by a.attnum)::int as position,
      a.attname, format_type(a.atttypid, a.atttypmod) as type,
      a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expr, coalesce(a.attacl::text, '') as colacl
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);
  fp.constraints = await rows(db, `
    select c.relname, k.conname, k.contype, pg_get_constraintdef(k.oid, true) as def, k.convalidated
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' order by c.relname, k.conname`);
  fp.indexes = await rows(db, `
    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by tablename, indexname`);
  fp.functions = await rows(db, `
    select p.oid::regprocedure::text as sig, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
      p.proconfig::text as config, p.provolatile, md5(p.prosrc) as src_md5,
      coalesce((select array_agg(coalesce(r.rolname, 'PUBLIC') || ':' || x.privilege_type
                order by coalesce(r.rolname, 'PUBLIC'), x.privilege_type)
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
        left join pg_roles r on r.oid = x.grantee), '{}') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by 1`);
  fp.policies = await rows(db, `
    select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    from pg_policies order by schemaname, tablename, policyname`);
  fp.triggers = await rows(db, `
    select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def, t.tgenabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public' order by c.relname, t.tgname`);
  fp.features = await rows(db, `select id, name, description, value_type from public.features order by id`);
  fp.slugs = await rows(db, `select id::text, to_jsonb(r) ->> 'slug' as slug from public.resources r order by id`);
  return fp;
}

function diffFingerprints(before, after) {
  const lines = [];
  for (const key of Object.keys(before)) {
    const a = before[key].map((row) => JSON.stringify(row));
    const b = after[key].map((row) => JSON.stringify(row));
    for (const row of a) if (!b.includes(row)) lines.push(`- [${key}] ${row}`);
    for (const row of b) if (!a.includes(row)) lines.push(`+ [${key}] ${row}`);
  }
  return lines;
}

function assertSameState(before, after, label, allowed = () => false) {
  const unexpected = diffFingerprints(before, after).filter((line) => !allowed(line));
  assert.equal(
    unexpected.length,
    0,
    `${label}: ${unexpected.length} difference(s)\n${unexpected.slice(0, 10).map((line) => line.slice(0, 360)).join("\n")}`,
  );
}

const changedRelationNames = (before, after) =>
  diffFingerprints(before, after)
    .filter((line) => line.includes("[relations]"))
    .map((line) => JSON.parse(line.replace(/^[-+] \[relations\] /, "")).relname);

// ------------------------------------------------------------------ helpers

async function runVerification(db, name) {
  return rows(db, verification(name));
}
const notOk = (result) => result.filter((row) => row.ok !== true).map((row) => `${row.check_name} :: ${row.detail}`);

async function addUser(db, label = "member") {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}-${id.slice(0, 8)}@test.invalid`]);
  return id;
}

async function addOwner(db) {
  const id = await addUser(db, "owner");
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role = 'owner' where id = $1", [id]);
  await db.exec("set session_replication_role = origin");
  return id;
}

const resourceId = async (db, title) =>
  (await rows(db, "select id from public.resources where title = $1", [title]))[0].id;

async function insertResource(db, fields) {
  const id = fields.id ?? randomUUID();
  const record = {
    id,
    delivery_mode: "web_app",
    cta_url: "https://games.kruaorry.app/play",
    cover_image_url: "https://cdn.kruaorry.app/cover.jpg",
    status: "published",
    published_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    ...fields,
  };
  const names = Object.keys(record);
  await db.query(
    `insert into public.resources (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
    names.map((name) => record[name]),
  );
  return id;
}

/** Run one statement as a browser role inside a transaction that is always rolled back. */
async function attempt(db, { role, user = null, sql, params = [], anonymous = false }) {
  return asRole(db, role, user, async () => {
    await db.exec("begin");
    try {
      const result = await db.query(sql, params);
      return { ok: true, rows: result.rows };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    } finally {
      await db.exec("rollback");
    }
  }, { anonymous });
}

// ============================================================ 0. baseline

await check("baseline: the real chain replays and pre-check.sql is satisfied", async () => {
  await withDb(async (db) => {
    const result = await runVerification(db, "pre-check");
    assert.deepEqual(notOk(result), [], "pre-check.sql must pass on the 051 baseline");
    const state = Object.fromEntries(
      result.filter((row) => row.check_name.startsWith("state:")).map((row) => [row.check_name.slice(7), row.detail]),
    );
    assert.equal(state["052 write-privilege cleanup"], "not applied yet");
    assert.equal(state["053 resources.slug"], "not applied yet");
    assert.equal(state["054 problem-report context"], "not applied yet");
    assert.match(state[Object.keys(state).find((key) => key.startsWith("saved_resources policies"))], /^2 policies$/);
  });
});

await check("baseline: the three verification files fail before and pass after (they detect real state)", async () => {
  await withDb(async (db) => {
    for (const name of ["052-verify", "053-verify", "054-verify"]) {
      assert.ok(notOk(await runVerification(db, name)).length > 0, `${name} must report problems before its migration`);
    }
    for (const number of ["052", "053", "054"]) await db.exec(migrationSql(number));
    for (const name of ["pre-check", "052-verify", "053-verify", "054-verify"]) {
      assert.deepEqual(notOk(await runVerification(db, name)), [], `${name} must pass after all three migrations`);
    }
    const state = Object.fromEntries(
      (await runVerification(db, "pre-check")).filter((row) => row.check_name.startsWith("state:")).map((row) => [row.check_name.slice(7), row.detail]),
    );
    assert.equal(state["052 write-privilege cleanup"], "already in place");
    assert.equal(state["053 resources.slug"], "already in place");
    assert.equal(state["054 problem-report context"], "already in place");
  });
});

// ================================================================ 1. 052

await check("052: browser roles keep every read and lose every write; only the ten ACLs change", async () => {
  await withDb(async (db) => {
    const before = await fingerprint(db);
    await db.exec(migrationSql("052"));
    const after = await fingerprint(db);
    assert.deepEqual(notOk(await runVerification(db, "052-verify")), []);
    assert.deepEqual([...new Set(changedRelationNames(before, after))].sort(), [...TEN_RELATIONS].sort());
    // No other kind of object (functions, policies, constraints, columns, indexes, data) is touched.
    assertSameState(before, after, "052 must change privileges only", (line) => line.includes("[relations]"));
    for (const relation of TEN_RELATIONS) {
      for (const role of ["anon", "authenticated"]) {
        const [{ ok }] = await rows(db, "select has_table_privilege($1, $2, 'SELECT') as ok", [role, `public.${relation}`]);
        const expectSelect = ["resource_catalog", "plan_benefit_catalog", "plans", "features", "plan_features"].includes(relation)
          || role === "authenticated";
        if (expectSelect && relation !== "admin_audit_log") assert.equal(ok, true, `${role} must still read ${relation}`);
      }
    }
  });
});

await check("052: re-running changes nothing", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("052"));
    const once = await fingerprint(db);
    await db.exec(migrationSql("052"));
    assertSameState(once, await fingerprint(db), "second run");
  });
});

await check("052: write privileges set at column level are removed with the table-level revoke", async () => {
  await withDb(async (db) => {
    await db.exec("revoke update on public.plans from authenticated; grant update (name) on public.plans to authenticated");
    const [{ ok: before }] = await rows(db, "select has_any_column_privilege('authenticated', 'public.plans', 'UPDATE') as ok");
    assert.equal(before, true, "set-up: the column grant exists");
    await db.exec(migrationSql("052"));
    const [{ ok }] = await rows(db, "select has_any_column_privilege('authenticated', 'public.plans', 'UPDATE') as ok");
    assert.equal(ok, false);
  });
});

await check("052: the app's legitimate paths still work and direct writes are refused as permission errors", async () => {
  await withDb(async (db) => {
    const owner = await addOwner(db);
    const member = await addUser(db);
    const member2 = await addUser(db);
    const resource = await resourceId(db, "Sentence Train");

    const legitimate = [
      ["owner changes a member role (admin console, audit trigger writes the log)", { role: "authenticated", user: owner, sql: "update public.profiles set role = 'admin' where id = $1", params: [member2] }],
      ["owner sets a member plan (writes subscriptions and events inside the RPC)", { role: "authenticated", user: owner, sql: "select public.set_member_plan($1, 'teacher', 'audit-test')", params: [member] }],
      ["owner edits feature copy through its RPC", { role: "authenticated", user: owner, sql: "select public.admin_update_feature_copy('favorites.enabled', 'รายการโปรด', 'บันทึกสื่อที่ชอบ')" }],
      ["member saves a favourite through its RPC", { role: "authenticated", user: member, sql: "select public.set_my_resource_saved($1, true)", params: [resource] }],
      ["anon reads plans", { role: "anon", sql: "select count(*) from public.plans" }],
      ["anon reads features", { role: "anon", sql: "select count(*) from public.features" }],
      ["anon reads plan_features", { role: "anon", sql: "select count(*) from public.plan_features" }],
      ["anon reads plan_benefit_catalog", { role: "anon", sql: "select count(*) from public.plan_benefit_catalog" }],
      ["anon reads resource_catalog", { role: "anon", sql: "select count(*) from public.resource_catalog" }],
      ["member reads review feed", { role: "authenticated", user: member, sql: "select count(*) from public.resource_review_feed" }],
      ["member reads review summary", { role: "authenticated", user: member, sql: "select count(*) from public.resource_review_summary" }],
      ["member reads own subscriptions", { role: "authenticated", user: member, sql: "select count(*) from public.subscriptions where user_id = $1", params: [member] }],
      ["member reads subscription events", { role: "authenticated", user: member, sql: "select count(*) from public.subscription_events" }],
      ["owner reads the audit log", { role: "authenticated", user: owner, sql: "select count(*) from public.admin_audit_log" }],
    ];
    const refused = [
      ["member self-grants a plan (UPDATE)", { role: "authenticated", user: member, sql: "update public.subscriptions set plan_id = 'founder' where user_id = $1", params: [member] }, /permission denied for table subscriptions/],
      ["member inserts a subscription", { role: "authenticated", user: member, sql: "insert into public.subscriptions (user_id, plan_id, status) values ($1, 'teacher', 'active')", params: [member] }, /permission denied for table subscriptions/],
      ["member edits a plan", { role: "authenticated", user: member, sql: "update public.plans set price_label = '0'" }, /permission denied for table plans/],
      ["member deletes features", { role: "authenticated", user: member, sql: "delete from public.features" }, /permission denied for table features/],
      ["owner writes the audit log directly", { role: "authenticated", user: owner, sql: "insert into public.admin_audit_log (target_id, field, new_value) values ($1, 'role', 'x')", params: [member] }, /permission denied for table admin_audit_log/],
      ["member truncates plan_features", { role: "authenticated", user: member, sql: "truncate public.plan_features" }, /permission denied for table plan_features/],
      ["member row-locks subscriptions", { role: "authenticated", user: member, sql: "select * from public.subscriptions for update" }, /permission denied for table subscriptions/],
      ["anon inserts through the catalogue view", { role: "anon", sql: "insert into public.resource_catalog (id, title) values (gen_random_uuid(), 'x')" }, /permission denied for (table|view) resource_catalog|cannot insert into view "resource_catalog"/],
      ["member updates through the catalogue view", { role: "authenticated", user: member, sql: "update public.resource_catalog set title = 'x'" }, /permission denied for (table|view) resource_catalog|cannot update view "resource_catalog"/],
    ];

    for (const [label, spec] of legitimate) {
      const result = await attempt(db, spec);
      assert.equal(result.ok, true, `before 052: ${label} -> ${result.error}`);
    }
    await db.exec(migrationSql("052"));
    for (const [label, spec] of legitimate) {
      const result = await attempt(db, spec);
      assert.equal(result.ok, true, `after 052: ${label} -> ${result.error}`);
    }
    for (const [label, spec, pattern] of refused) {
      const result = await attempt(db, spec);
      assert.equal(result.ok, false, `after 052: ${label} must be refused`);
      assert.match(result.error, pattern, `after 052: ${label}`);
    }
    // What a browser role may still hold on the ten objects is exactly what the 052 header calls
    // "NOT COVERED": reads plus the housekeeping privileges (REFERENCES, TRIGGER, and MAINTAIN on
    // PostgreSQL 17+). None of them can change a row, and PostgREST cannot reach them.
    const residual = await rows(db, `
      select distinct x.privilege_type
      from pg_class c, aclexplode(c.relacl) x
      where c.relnamespace = 'public'::regnamespace and c.relname = any($1::text[])
        and x.grantee in ('anon'::regrole, 'authenticated'::regrole)`, [TEN_RELATIONS]);
    const allowedResidual = new Set(["SELECT", "REFERENCES", "TRIGGER", "MAINTAIN"]);
    assert.deepEqual(residual.map((row) => row.privilege_type).filter((privilege) => !allowedResidual.has(privilege)), []);
  });
});

await check("052: stops with a clear message and changes nothing when a read the app needs is missing", async () => {
  await withDb(async (db) => {
    await db.exec("revoke select on public.features from anon");
    const before = await fingerprint(db);
    await failsWith(db.exec(migrationSql("052")), /052: anon does not have SELECT on public\.features/, "052 with anon lacking SELECT");
    assertSameState(before, await fingerprint(db), "an aborted 052 must leave every ACL as it was");
  });
});

await check("052 rollback: restores the previous privileges exactly, can be repeated, forward works again", async () => {
  await withDb(async (db) => {
    const before = await fingerprint(db);
    await db.exec(migrationSql("052"));
    const applied = await fingerprint(db);
    await db.exec(rollbackSql("052"));
    assertSameState(before, await fingerprint(db), "rollback of 052");
    await db.exec(rollbackSql("052"));
    assertSameState(before, await fingerprint(db), "second rollback of 052");
    await db.exec(migrationSql("052"));
    assertSameState(applied, await fingerprint(db), "052 applied again after its rollback");
  });
});

// ================================================================ 2. 053

const SEEDED_TITLES_WITH_SLUG = SEEDED_SLUG_COUNT;

await check("053: adds slug, constraint, unique index and the view column; 17 seeded resources get a slug", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    assert.deepEqual(notOk(await runVerification(db, "053-verify")), []);
    const [{ n }] = await rows(db, "select count(*)::int as n from public.resources where slug is not null");
    assert.equal(n, SEEDED_TITLES_WITH_SLUG);
    const slugs = await rows(db, "select slug from public.resources where slug is not null order by slug");
    assert.equal(new Set(slugs.map((row) => row.slug)).size, SEEDED_SLUG_COUNT);
    const published = await rows(db, "select count(*)::int as n from public.resource_catalog where slug is not null");
    assert.equal(published[0].n, SEEDED_SLUG_COUNT, "every seeded resource is public, so the view shows all 17 slugs");
  });
});

await check("053: the catalogue exposes exactly the same rows and values as before, plus slug", async () => {
  await withDb(async (db) => {
    // Rows that must stay hidden (placeholder, local, reserved hosts, unpublished, unfinished file) and visible ones.
    const fileId = randomUUID();
    const fileId2 = randomUUID();
    const plans = [
      { title: "edge visible https", cta_url: "https://games.kruaorry.app/edge" },
      { title: "edge visible relative", cta_url: "/app" },
      { title: "edge hidden localhost", cta_url: "http://localhost:3000/x" },
      { title: "edge hidden example.com", cta_url: "https://www.example.com/x" },
      { title: "edge hidden placeholder", cta_url: "https://games.kruaorry.app/placeholder-game" },
      { title: "edge hidden private ip", cta_url: "http://192.168.1.5/x" },
      { title: "edge hidden draft", cta_url: "https://games.kruaorry.app/draft", status: "draft" },
      { id: fileId, title: "edge visible file", delivery_mode: "file_download", cta_url: null, file_path: `${fileId}/worksheet.pdf` },
      { id: fileId2, title: "edge hidden file placeholder", delivery_mode: "file_download", cta_url: null, file_path: `${fileId2}/placeholder.pdf` },
      { title: "edge hidden file blank path", delivery_mode: "file_download", cta_url: null, file_path: "   " },
      { title: "edge hidden file under another id", delivery_mode: "file_download", cta_url: null, file_path: `${randomUUID()}/worksheet.pdf` },
    ];
    for (const fields of plans) await insertResource(db, fields);
    const snapshotOfCatalogue = async (stripSlug) => rows(db,
      `select to_jsonb(c) ${stripSlug ? "- 'slug'" : ""} as row from public.resource_catalog c order by c.id`);
    const before = await snapshotOfCatalogue(false);
    const visibleEdges = (await rows(db, "select title from public.resource_catalog where title like 'edge %' order by title")).map((row) => row.title);
    assert.deepEqual(visibleEdges, ["edge visible file", "edge visible https", "edge visible relative"]);
    await db.exec(migrationSql("053"));
    const after = await snapshotOfCatalogue(true);
    assert.deepEqual(after, before, "053 may add the slug column but must not change which rows or values the catalogue exposes");
    const columns = await rows(db, `
      select a.attname, format_type(a.atttypid, a.atttypmod) as type
      from pg_attribute a where a.attrelid = 'public.resource_catalog'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`);
    assert.equal(columns.length, 22);
    assert.deepEqual(columns.at(-1), { attname: "slug", type: "text" });
  });
});

await check("053: is idempotent (second run changes nothing, not even slugs)", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    const once = await fingerprint(db);
    await db.exec(migrationSql("053"));
    assertSameState(once, await fingerprint(db), "second run of 053");
  });
});

await check("053: the backfill is keyed by id, so edited, duplicated or re-typed titles change nothing", async () => {
  await withDb(async (db) => {
    const draftTwin = await insertResource(db, { title: "Sentence Train", status: "draft" });
    await db.query("update public.resources set title = 'Listening Detective ' where title = 'Listening Detective'");
    await db.query("update public.resources set title = 'daily word detective' where title = 'Daily Word Detective'");
    await db.query("update public.resources set title = 'ก้าวคำ - ฟัง อ่าน สะกด เขียน' where title like 'ก้าวคำ%'");
    const decomposed = String.fromCharCode(0x0e4d, 0x0e32);
    await db.query("update public.resources set title = replace(title, $1, $2) where title = 'ตกปลาคำศัพท์'", [String.fromCharCode(0x0e33), decomposed]);
    await db.exec(migrationSql("053"));
    const [{ n }] = await rows(db, "select count(*)::int as n from public.resources where slug is not null");
    assert.equal(n, SEEDED_SLUG_COUNT, "all 17 seeded rows are slugged whatever their titles became");
    const [twin] = await rows(db, "select slug from public.resources where id = $1", [draftTwin]);
    assert.equal(twin.slug, null, "a draft that merely shares a seeded title must not get the seeded slug");
    assert.equal((await rows(db, "select slug from public.resources where id = '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'"))[0].slug, "sentence-train");
  });
});

await check("053: never overwrites a slug that is already set and never steals one that is taken", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    // An editor chose a different slug for a seeded row; a second run keeps it.
    await db.query("update public.resources set slug = 'my-custom-slug' where id = '4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'");
    // A mapped slug is released and taken by another resource; a second run leaves that row UUID-only.
    await db.query("update public.resources set slug = null where id = 'ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'");
    const other = await insertResource(db, { title: "Another game", slug: "word-squad" });
    await db.exec(migrationSql("053"));
    const bySlug = async (id) => (await rows(db, "select slug from public.resources where id = $1", [id]))[0].slug;
    assert.equal(await bySlug("4c1203ce-6e4f-40bd-8dc2-01713e88dcdd"), "my-custom-slug");
    assert.equal(await bySlug(other), "word-squad");
    assert.equal(await bySlug("ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8"), null);
  });
});

await check("053: a published resource that is not in the list is left UUID-only and reported, not an error", async () => {
  await withDb(async (db) => {
    const added = await insertResource(db, { title: "Brand new game" });
    await db.exec(migrationSql("053"));
    assert.equal((await rows(db, "select slug from public.resources where id = $1", [added]))[0].slug, null);
    const info = (await runVerification(db, "053-verify")).find((row) => row.check_name.startsWith("info: published resources"));
    assert.match(info.detail, /Brand new game/);
  });
});

await check("053: the database accepts and refuses exactly the slugs the application's isValidSlug does", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    await db.query("update public.resources set slug = null"); // the documented link-neutral rollback statement
    const target = await insertResource(db, { title: "slug lab", status: "draft" });
    const setSlug = (value) => db.query("update public.resources set slug = $1 where id = $2", [value, target]);
    for (const value of slugCorpus.valid) {
      await setSlug(value);
      await setSlug(null);
    }
    for (const value of slugCorpus.invalid) {
      const error = await failsWith(setSlug(value), /resources_slug_format/, `slug ${JSON.stringify(value)}`);
      assert.equal(error.code, "23514");
    }
    // NULL means "UUID address only", any number of rows may have it.
    const other = await insertResource(db, { title: "slug lab 2", status: "draft" });
    await db.query("update public.resources set slug = null where id = any($1::uuid[])", [[target, other]]);
  });
});

await check("053: slugs are unique; a duplicate is refused by the index", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    const extra = await insertResource(db, { title: "twin" });
    const error = await failsWith(
      db.query("update public.resources set slug = 'sentence-train' where id = $1", [extra]),
      /resources_slug_key/,
      "duplicate slug",
    );
    assert.equal(error.code, "23505");
  });
});

await check("053: refuses a view that is not the one it was written against, changing nothing", async () => {
  await withDb(async (db) => {
    await db.exec("alter view public.resource_catalog rename column review_count to review_total");
    const before = await fingerprint(db);
    await failsWith(db.exec(migrationSql("053")), /053: public\.resource_catalog has columns/, "renamed view column");
    assertSameState(before, await fingerprint(db), "053 must stop before writing anything");
  });
  await withDb(async (db) => {
    await db.exec("alter view public.resource_catalog set (security_barrier = false)");
    const before = await fingerprint(db);
    await failsWith(db.exec(migrationSql("053")), /053: public\.resource_catalog is not a security_barrier view/, "security_barrier off");
    assertSameState(before, await fingerprint(db), "053 must stop before writing anything");
  });
});

await check("053: a hand-made slug column holding bad data aborts the whole file and rolls everything back", async () => {
  await withDb(async (db) => {
    await db.exec("alter table public.resources add column slug text");
    await db.query("update public.resources set slug = 'Bad Slug' where id = '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'");
    const before = await fingerprint(db);
    await failsWith(db.exec(migrationSql("053")), /resources_slug_format|violates check constraint/, "invalid existing slug");
    assertSameState(before, await fingerprint(db), "a failed 053 must leave the database as it was");
    // pre-check.sql tells the operator about a differently typed column before they run anything
  });
  await withDb(async (db) => {
    await db.exec("alter table public.resources add column slug varchar(100)");
    const flagged = (await runVerification(db, "pre-check")).filter((row) => row.ok !== true).map((row) => row.check_name);
    assert.deepEqual(flagged, ["resources.slug can be added (the name is free or already the 053 column)"]);
  });
});

await check("053 rollback: view, ACL, policies, constraints and indexes return to their previous state", async () => {
  await withDb(async (db) => {
    const before = await fingerprint(db);
    const catalogueBefore = await rows(db, "select to_jsonb(c) as row from public.resource_catalog c order by c.id");
    await db.exec(migrationSql("053"));
    const applied = await fingerprint(db);
    await db.exec(rollbackSql("053"));
    const rolledBack = await fingerprint(db);
    // The only intended residue: resource_catalog keeps an always-NULL `slug` column (documented),
    // so its definition and column list differ and resources.slug / its constraint / its index are gone.
    const unexpected = diffFingerprints(before, rolledBack).filter((line) => {
      if (/\[relations\] .*"relname":"resource_catalog"/.test(line)) return true;
      if (/\[columns\] .*"relname":"resource_catalog"/.test(line)) return true;
      return false;
    });
    assertSameState(before, rolledBack, "rollback of 053", (line) => unexpected.includes(line));
    const viewDefinition = (await rows(db, "select pg_get_viewdef('public.resource_catalog'::regclass, true) as d"))[0].d;
    assert.match(viewDefinition, /NULL::text AS slug/);
    const residual = diffFingerprints(before, rolledBack).filter((line) => line.includes("resource_catalog"));
    assert.ok(residual.every((line) => /viewdef|slug|position/.test(line)), `only the view definition and its slug column may remain:\n${residual.join("\n").slice(0, 600)}`);
    // The catalogue serves the same rows, with slug NULL everywhere.
    const catalogueAfter = await rows(db, "select to_jsonb(c) - 'slug' as row from public.resource_catalog c order by c.id");
    assert.deepEqual(catalogueAfter, catalogueBefore.map((row) => ({ row: row.row })));
    const slugs = await rows(db, "select distinct slug from public.resource_catalog");
    assert.deepEqual(slugs, [{ slug: null }]);
    // saved_resources policies depend on the view and were never dropped.
    assert.deepEqual(rolledBack.policies, before.policies);
    // Repeating the rollback is harmless and the forward migration works again.
    await db.exec(rollbackSql("053"));
    await db.exec(migrationSql("053"));
    assertSameState(applied, await fingerprint(db), "053 applied again after its rollback");
    assert.deepEqual(notOk(await runVerification(db, "053-verify")), []);
  });
});

await check("053 link-neutral rollback: clearing slugs alone makes the catalogue UUID-only without any DDL", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("053"));
    await db.query("update public.resources set slug = null");
    const [{ n }] = await rows(db, "select count(slug)::int as n from public.resource_catalog");
    assert.equal(n, 0);
    await db.exec(migrationSql("053"));
    const [{ n: restored }] = await rows(db, "select count(slug)::int as n from public.resource_catalog");
    assert.equal(restored, SEEDED_SLUG_COUNT, "re-running 053 gives the seeded resources their slugs back");
  });
});

// ================================================================ 3. 054

/** Submit a report as a member; `style` selects how the call is written. */
async function submitReport(db, user, { resource, category, details = "รายละเอียดทดสอบ 12345", context, style = "named" }) {
  return asRole(db, "authenticated", user, async () => {
    let result;
    if (style === "three-arguments") {
      result = await db.query(
        "select public.submit_resource_issue(p_resource_id := $1, p_category := $2, p_details := $3) as id",
        [resource, category, details],
      );
    } else if (style === "positional") {
      result = await db.query(
        "select public.submit_resource_issue($1, $2, $3, $4::jsonb) as id",
        [resource, category, details, context === undefined ? null : JSON.stringify(context)],
      );
    } else {
      result = await db.query(
        "select public.submit_resource_issue(p_resource_id := $1, p_category := $2, p_details := $3, p_context := $4::jsonb) as id",
        [resource, category, details, context === undefined ? null : JSON.stringify(context)],
      );
    }
    return result.rows[0].id;
  });
}
const storedContext = async (db, id) =>
  (await rows(db, "select context, pg_column_size(context) as size from public.resource_issue_reports where id = $1", [id]))[0];

await check("054: widens the category check, adds context, replaces the function and publishes the marker last", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    assert.deepEqual(notOk(await runVerification(db, "054-verify")), []);
    const functions = await rows(db, "select p.oid::regprocedure::text as sig from pg_proc p where p.proname = 'submit_resource_issue' and p.pronamespace = 'public'::regnamespace");
    assert.deepEqual(functions, [{ sig: "submit_resource_issue(uuid,text,text,jsonb)" }]);
    const execute = async (role) => (await rows(db, "select has_function_privilege($1, 'public.submit_resource_issue(uuid,text,text,jsonb)', 'EXECUTE') as ok", [role]))[0].ok;
    assert.deepEqual([await execute("anon"), await execute("authenticated")], [false, true]);
  });
});

await check("054: keeps four short known context keys, drops everything else, stays inside 1 KB", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    const users = [];
    for (let i = 0; i < 16; i += 1) users.push(await addUser(db));
    const resource = await resourceId(db, "Sentence Train");
    let next = 0;
    const report = (category, context, extra = {}) => submitReport(db, users[next++ % users.length], { resource, category, context, ...extra });
    const keys = ["app_version", "browser", "os", "viewport"];
    const maxLength = { app_version: 40, browser: 40, os: 40, viewport: 20 };

    const normal = await storedContext(db, await report("no_sound", { app_version: "0.1.0+abc1234", browser: "Chrome 129", os: "Android", viewport: "390x844" }));
    assert.deepEqual(normal.context, { app_version: "0.1.0+abc1234", browser: "Chrome 129", os: "Android", viewport: "390x844" });

    const extra = await storedContext(db, await report("cannot_play", { app_version: "x", user_agent: "Mozilla/5.0", ip: "1.2.3.4", email: "a@b.c", nested: { a: 1 } }));
    assert.deepEqual(extra.context, { app_version: "x" }, "unknown keys never reach the table");

    const weird = await storedContext(db, await report("wrong_answer", { app_version: { a: [1, 2, 3] }, browser: ["x", "y"], os: 123, viewport: true }));
    for (const [key, value] of Object.entries(weird.context)) {
      assert.ok(keys.includes(key) && typeof value === "string" && value.length <= maxLength[key], `${key} must be a short string, got ${JSON.stringify(value)}`);
    }

    const long = await storedContext(db, await report("camera_issue", { app_version: "a".repeat(5000), browser: "b".repeat(5000), os: "c".repeat(5000), viewport: "d".repeat(5000) }));
    assert.deepEqual(Object.fromEntries(Object.entries(long.context).map(([key, value]) => [key, value.length])), maxLength);

    const wide = await storedContext(db, await report("mobile_layout", {
      app_version: "😀".repeat(500), browser: "😀".repeat(500), os: "😀".repeat(500), viewport: "😀".repeat(500),
    }));
    assert.ok(wide.size <= 1024, `the widest possible context is ${wide.size} bytes, over the 1 KB limit`);
    const thai = await storedContext(db, await report("other", { app_version: "ก".repeat(500), browser: "ก".repeat(500), os: "ก".repeat(500), viewport: "ก".repeat(500) }));
    assert.ok(thai.size <= 1024);

    for (const [label, context] of [["json null", null], ["array", [1, 2]], ["string", "hello"], ["empty object", {}], ["only nulls", { app_version: null }], ["wrong-case keys", { App_Version: "x", BROWSER: "y" }]]) {
      const stored = await storedContext(db, await report("cannot_open", context, { resource }));
      assert.equal(stored.context, null, `${label} stores no context`);
      await db.query("delete from public.resource_issue_reports where id = (select id from public.resource_issue_reports order by created_at desc limit 1)");
    }
  });
});

await check("054: callable the old way (three named arguments) and positionally; refuses bad callers and bad input", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    const [a, b, c, d, e] = [await addUser(db), await addUser(db), await addUser(db), await addUser(db), await addUser(db)];
    const resource = await resourceId(db, "Sentence Train");
    const oldClient = await submitReport(db, a, { resource, category: "other", style: "three-arguments" });
    assert.equal((await storedContext(db, oldClient)).context, null);
    const positional = await submitReport(db, b, { resource, category: "other", style: "positional" });
    assert.equal((await storedContext(db, positional)).context, null);

    await failsWith(submitReport(db, c, { resource, category: "made_up" }), /Invalid issue category/, "invalid category");
    await failsWith(
      asRole(db, "authenticated", c, () => db.query("select public.submit_resource_issue($1, null, 'abcdefgh')", [resource])),
      /./, "null category",
    );
    assert.equal((await rows(db, "select count(*)::int as n from public.resource_issue_reports where reporter_id = $1", [c]))[0].n, 0, "a refused call stores nothing");
    await failsWith(asRole(db, "anon", null, () => db.query("select public.submit_resource_issue($1, 'no_sound', 'abcdefgh')", [resource])), /permission denied for function submit_resource_issue/, "anon caller");
    await failsWith(
      asRole(db, "authenticated", d, () => db.query("select public.submit_resource_issue($1, 'no_sound', 'abcdefgh')", [resource]), { anonymous: true }),
      /Authenticated member required/, "anonymous-session caller",
    );
    await failsWith(submitReport(db, e, { resource, category: "no_sound", details: "abc" }), /Issue details must contain 5 to 1000 characters/, "short details");
    const draft = await insertResource(db, { title: "unpublished", status: "draft" });
    await failsWith(submitReport(db, e, { resource: draft, category: "no_sound" }), /Published entitled resource required/, "unpublished resource");
  });
});

await check("054: the limits from migration 029 still hold (5 per hour, one open report per resource and category)", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    const user = await addUser(db);
    const resource = await resourceId(db, "Sentence Train");
    const categories = [...OLD_CATEGORIES, NEW_CATEGORIES[0]];
    for (const category of categories.slice(0, 5)) await submitReport(db, user, { resource, category });
    await failsWith(submitReport(db, user, { resource, category: categories[5] }), /Issue report rate limit reached/, "sixth report in an hour");
    const other = await addUser(db);
    await submitReport(db, other, { resource, category: "other" });
    const error = await failsWith(submitReport(db, other, { resource, category: "other" }), /An unresolved report of this type already exists/, "duplicate open report");
    assert.equal(error.code, "23505");
  });
});

await check("054: the table itself refuses a malformed context and an unknown category", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    const resource = await resourceId(db, "Sentence Train");
    const insert = async (category, contextSql) => {
      const reporter = await addUser(db);
      await db.exec(
        `insert into public.resource_issue_reports (resource_id, reporter_id, category, details, context) values ('${resource}', '${reporter}', '${category}', 'abcdefgh', ${contextSql})`,
      );
    };
    await insert("other", "null");
    await insert("other", "jsonb_build_object('os', 'iOS')");
    for (const bad of ["'[]'::jsonb", "'\"x\"'::jsonb", "'null'::jsonb", "jsonb_build_object('a', repeat('x', 2000))"]) {
      await failsWith(insert("other", bad), /resource_issue_reports_context_shape/, `context ${bad}`);
    }
    await failsWith(insert("zzz", "null"), /resource_issue_reports_category_check/, "unknown category");
    for (const category of [...OLD_CATEGORIES, ...NEW_CATEGORIES]) await insert(category, "null");
  });
});

await check("054: existing reports survive, and a category check with an unexpected name is replaced, not duplicated", async () => {
  await withDb(async (db) => {
    const reporter = await addUser(db);
    const resource = await resourceId(db, "Sentence Train");
    for (const category of OLD_CATEGORIES) {
      await db.query("insert into public.resource_issue_reports (resource_id, reporter_id, category, details) values ($1, $2, $3, 'existing report')", [resource, reporter, category]);
    }
    await db.exec("alter table public.resource_issue_reports rename constraint resource_issue_reports_category_check to legacy_category_rule");
    await db.exec(migrationSql("054"));
    const [{ n }] = await rows(db, "select count(*)::int as n from public.resource_issue_reports where details = 'existing report'");
    assert.equal(n, OLD_CATEGORIES.length);
    const categoryChecks = await rows(db, `
      select conname from pg_constraint
      where conrelid = 'public.resource_issue_reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'`);
    assert.deepEqual(categoryChecks, [{ conname: "resource_issue_reports_category_check" }]);
    assert.deepEqual(notOk(await runVerification(db, "054-verify")), []);
  });
});

await check("054: is idempotent (second run changes nothing, data stays)", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("054"));
    const member = await addUser(db);
    const resource = await resourceId(db, "Sentence Train");
    await submitReport(db, member, { resource, category: "no_sound", context: { os: "iOS" } });
    const once = await fingerprint(db);
    await db.exec(migrationSql("054"));
    assertSameState(once, await fingerprint(db), "second run of 054");
    assert.equal((await rows(db, "select count(*)::int as n from public.resource_issue_reports"))[0].n, 1);
  });
});

await check("054 rollback (no new-category reports): the previous function, grants, check and columns come back exactly", async () => {
  await withDb(async (db) => {
    const before = await fingerprint(db);
    await db.exec(migrationSql("054"));
    const applied = await fingerprint(db);
    await db.exec(rollbackSql("054"));
    assertSameState(before, await fingerprint(db), "rollback of 054");
    await db.exec(rollbackSql("054"));
    assertSameState(before, await fingerprint(db), "second rollback of 054");
    await db.exec(migrationSql("054"));
    assertSameState(applied, await fingerprint(db), "054 applied again after its rollback");
  });
});

await check("054 rollback (a new-category report exists): nothing is deleted, the widened check and context stay", async () => {
  await withDb(async (db) => {
    const before = await fingerprint(db);
    await db.exec(migrationSql("054"));
    const member = await addUser(db);
    const resource = await resourceId(db, "Sentence Train");
    const id = await submitReport(db, member, { resource, category: "no_sound", context: { os: "iOS" } });
    await db.exec(rollbackSql("054"));
    const after = await fingerprint(db);
    const functionsAfter = after.functions.filter((row) => row.sig.startsWith("submit_resource_issue"));
    assert.deepEqual(functionsAfter, before.functions.filter((row) => row.sig.startsWith("submit_resource_issue")), "function and grants are the old ones");
    assert.deepEqual(after.features, before.features, "the readiness marker is gone");
    assert.equal((await rows(db, "select count(*)::int as n from public.resource_issue_reports where id = $1", [id]))[0].n, 1, "the report survives");
    assert.deepEqual((await storedContext(db, id)).context, { os: "iOS" });
    // The old three-argument call works again against the rolled-back database.
    const other = await addUser(db);
    await submitReport(db, other, { resource, category: "other", style: "three-arguments" });
    // A new-category call is refused again by the old function.
    await failsWith(submitReport(db, other, { resource, category: "camera_issue", style: "three-arguments" }), /Invalid issue category/, "new category after rollback");
    // Rolling forward again works and the marker is back.
    await db.exec(migrationSql("054"));
    assert.deepEqual(notOk(await runVerification(db, "054-verify")), []);
  });
});

// ============================================== 4. combinations and order

await check("052 + 053 + 054: every apply order ends in the same state, and rollbacks return to the baseline", async () => {
  const orders = [["052", "053", "054"], ["052", "054", "053"], ["053", "052", "054"], ["053", "054", "052"], ["054", "052", "053"], ["054", "053", "052"]];
  let reference = null;
  let baseline = null;
  for (const order of orders) {
    await withDb(async (db) => {
      if (!baseline) baseline = await fingerprint(db);
      for (const number of order) await db.exec(migrationSql(number));
      const state = await fingerprint(db);
      if (!reference) {
        reference = state;
        for (const name of ["pre-check", "052-verify", "053-verify", "054-verify"]) assert.deepEqual(notOk(await runVerification(db, name)), [], name);
      } else {
        assertSameState(reference, state, `order ${order.join(" > ")} versus ${orders[0].join(" > ")}`);
      }
      // Re-running all three changes nothing.
      for (const number of order) await db.exec(migrationSql(number));
      assertSameState(reference, await fingerprint(db), `order ${order.join(" > ")} applied twice`);
    });
  }
  await withDb(async (db) => {
    for (const number of ["052", "053", "054"]) await db.exec(migrationSql(number));
    for (const number of ["054", "053", "052"]) await db.exec(rollbackSql(number));
    // After every rollback the only difference from the 051 baseline is the always-NULL slug column of the view.
    assertSameState(baseline, await fingerprint(db), "all three rolled back", (line) => /resource_catalog/.test(line));
    const residual = diffFingerprints(baseline, await fingerprint(db)).filter((line) => /resource_catalog/.test(line));
    assert.ok(residual.every((line) => /viewdef|slug|position/.test(line)), residual.join("\n").slice(0, 500));
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`failed:\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
