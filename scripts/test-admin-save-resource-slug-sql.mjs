// Migration 055 (admin_save_resource gains an optional p_slug) against the REAL
// migration chain: supabase/migrations/001..054 are replayed in-process by
// PGlite with Supabase-like roles. Local only: it never connects to a remote
// database and needs no credentials.
//
//   npm run test:admin-save-slug-sql
//
// What it proves
//   * only admins/owners can call the function; anon and members are refused
//   * callers that omit p_slug (the console before this change) behave exactly as before
//   * a slug is validated (format, UUID shape, length), kept on null/blank, and unique
//   * nothing else in the database changes, re-running is a no-op
//   * the guards stop a wrong database before anything is written
//   * the rollback restores migration 028's function byte for byte
//   * supabase/verification/055-verify.sql separates "not applied" from "applied"
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, fromSnapshot, migrationSql, rollbackSql, rows, snapshotOf } from "./lib/real-chain.mjs";

const slugCorpus = JSON.parse(
  readFileSync(new URL("../src/lib/__tests__/fixtures/slug-corpus.json", import.meta.url), "utf8"),
);
const verification = readFileSync(new URL("../supabase/verification/055-verify.sql", import.meta.url), "utf8");

const OLD_ARGS = "uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[]";
const NEW_ARGS = `${OLD_ARGS}, text`;
// regprocedure prints argument types without spaces after the commas.
const compact = (args) => args.replace(/, /g, ",");

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

console.log("replaying migrations 001..054 …");
const baseStarted = Date.now();
const baseDb = await chainDb("054");
const baseSnapshot = await snapshotOf(baseDb);
await baseDb.close();
console.log(`baseline ready in ${Date.now() - baseStarted} ms\n`);

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

async function addUser(db, label, role = null) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}-${id.slice(0, 8)}@test.invalid`]);
  if (role) {
    await db.exec("set session_replication_role = replica");
    await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
    await db.exec("set session_replication_role = origin");
  }
  return id;
}

const runVerification = (db) => rows(db, verification);
const notOk = (result) => result.filter((row) => row.ok !== true).map((row) => `${row.check_name} :: ${row.detail}`);

/** Everything outside admin_save_resource that this migration must leave alone. */
async function fingerprint(db) {
  return {
    functions: await rows(db, `
      select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig::text as config, md5(p.prosrc) as src,
        coalesce((select array_agg(coalesce(r.rolname, 'PUBLIC') || ':' || x.privilege_type
          order by coalesce(r.rolname, 'PUBLIC'), x.privilege_type)
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
          left join pg_roles r on r.oid = x.grantee), '{}') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname <> 'admin_save_resource' order by 1`),
    relations: await rows(db, `
      select c.relname, c.relkind, c.reloptions::text as options, c.relacl::text as acl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`),
    columns: await rows(db, `
      select c.relname, a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped order by 1, a.attnum`),
    constraints: await rows(db, `
      select c.relname, k.conname, pg_get_constraintdef(k.oid, true) as def
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' order by 1, 2`),
    indexes: await rows(db, "select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1"),
    policies: await rows(db, "select tablename, policyname, cmd, qual, with_check from pg_policies order by 1, 2"),
    triggers: await rows(db, `
      select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = 'public' order by 1, 2`),
    data: await rows(db, "select id::text, title, slug, status from public.resources order by id"),
  };
}

const saveFunction = (db) => rows(db, `
  select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig::text as config, md5(p.prosrc) as src,
    coalesce((select array_agg(coalesce(r.rolname, 'PUBLIC') || ':' || x.privilege_type
      order by coalesce(r.rolname, 'PUBLIC'), x.privilege_type)
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
      left join pg_roles r on r.oid = x.grantee), '{}') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_save_resource'`);

/** Call the function as a signed-in user. `slug` undefined = the 16-argument call the console used before 055. */
function save(db, userId, { id, create = true, title = "Slug Test", slug, accessMode = "locked", planIds = [] }) {
  const args = [
    id, create, title, null, null, null, ["p1"], "google_template", "https://docs.google.com/x", null,
    null, null, null, null, accessMode, planIds,
  ];
  const sql = slug === undefined
    ? `select public.admin_save_resource($1::uuid, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13::bigint, $14, $15, $16::text[])`
    : `select public.admin_save_resource($1::uuid, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13::bigint, $14, $15, $16::text[], $17)`;
  return asRole(db, "authenticated", userId, () => db.query(sql, slug === undefined ? args : [...args, slug]));
}

const slugOf = async (db, id) => (await rows(db, "select slug from public.resources where id = $1", [id]))[0]?.slug;

// ----------------------------------------------------------------- checks

await check("forward: one 17-argument SECURITY DEFINER function, grants as in 028, 055-verify all true", async () => {
  await withDb(async (db) => {
    const before = await saveFunction(db);
    assert.equal(before.length, 1);
    assert.equal(before[0].sig, `admin_save_resource(${compact(OLD_ARGS)})`, "starts as the 16-argument function");
    assert.ok(notOk(await runVerification(db)).length > 0, "verification must fail before 055");

    await db.exec(migrationSql("055"));
    const after = await saveFunction(db);
    assert.equal(after.length, 1, "no overload left behind");
    assert.equal(after[0].sig, `admin_save_resource(${compact(NEW_ARGS)})`);
    assert.equal(after[0].prosecdef, true);
    assert.equal(after[0].config, '{"search_path=\\"\\""}');
    assert.ok(!after[0].acl.includes("PUBLIC:EXECUTE"), `PUBLIC must not execute: ${after[0].acl}`);
    assert.ok(!after[0].acl.includes("anon:EXECUTE"), `anon must not execute: ${after[0].acl}`);
    assert.ok(after[0].acl.includes("authenticated:EXECUTE"));
    // Privileges are exactly the ones migration 028 left behind.
    assert.deepEqual(after[0].acl, before[0].acl, "same grants as the 16-argument function");
    assert.deepEqual(notOk(await runVerification(db)), []);
  });
});

await check("nothing outside admin_save_resource changes, and re-running 055 is a no-op", async () => {
  await withDb(async (db) => {
    const baseline = await fingerprint(db);
    await db.exec(migrationSql("055"));
    const once = await fingerprint(db);
    assert.deepEqual(once, baseline, "everything except admin_save_resource is untouched");
    const functionOnce = await saveFunction(db);
    await db.exec(migrationSql("055"));
    assert.deepEqual(await saveFunction(db), functionOnce, "second run changes nothing");
    assert.deepEqual(await fingerprint(db), baseline);
  });
});

await check("who may call it: owner and admin yes; member, anonymous guest and signed-out no", async () => {
  await withDb(async (db) => {
    const owner = await addUser(db, "owner", "owner");
    const admin = await addUser(db, "admin", "admin");
    const member = await addUser(db, "member");
    await save(db, owner, { id: randomUUID(), title: "By owner" });
    await save(db, admin, { id: randomUUID(), title: "By admin", slug: "by-admin-resource" });
    await failsWith(save(db, member, { id: randomUUID(), slug: "member-attempt" }), /Admin access required/, "member");
    await failsWith(save(db, member, { id: randomUUID() }), /Admin access required/, "member without slug");
    const guest = await addUser(db, "guest");
    await db.query("update auth.users set is_anonymous = true where id = $1", [guest]);
    await failsWith(
      asRole(db, "authenticated", guest, () => db.query(`select public.admin_save_resource($1::uuid, true, 'x', null, null, null, '{}'::text[], 'google_template', 'https://x.test', null, null, null, null::bigint, null, 'locked', '{}'::text[], 'guest-slug')`, [randomUUID()]), { anonymous: true }),
      /Admin access required/, "anonymous guest");
    await failsWith(
      asRole(db, "anon", null, () => db.query(`select public.admin_save_resource($1::uuid, true, 'x', null, null, null, '{}'::text[], 'google_template', 'https://x.test', null, null, null, null::bigint, null, 'locked', '{}'::text[], 'anon-slug')`, [randomUUID()])),
      /permission denied for function admin_save_resource/, "signed-out");
    assert.equal((await rows(db, "select count(*)::int as n from public.resources where title in ('By owner','By admin')"))[0].n, 2);
    assert.equal(await slugOf(db, (await rows(db, "select id from public.resources where title = 'By admin'"))[0].id), "by-admin-resource");
  }, { apply: ["055"] });
});

await check("a caller that omits p_slug behaves exactly as before 055 (create, update, other fields)", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = randomUUID();
    await save(db, admin, { id, title: "  Old style  " });
    assert.equal(await slugOf(db, id), null, "create without slug leaves it empty");
    await db.query("update public.resources set slug = 'kept-slug' where id = $1", [id]);
    await save(db, admin, { id, create: false, title: "Renamed" });
    const row = (await rows(db, "select title, slug, status, access_mode from public.resources where id = $1", [id]))[0];
    assert.deepEqual(row, { title: "Renamed", slug: "kept-slug", status: "draft", access_mode: "locked" });
    // Both ways of omitting it (argument left off, explicit null, blank text) mean "no change".
    await save(db, admin, { id, create: false, title: "Renamed again", slug: null });
    await save(db, admin, { id, create: false, title: "Renamed thrice", slug: "" });
    await save(db, admin, { id, create: false, title: "Renamed four", slug: "   " });
    assert.equal(await slugOf(db, id), "kept-slug");
    assert.equal((await rows(db, "select title from public.resources where id = $1", [id]))[0].title, "Renamed four");
  }, { apply: ["055"] });
});

await check("a valid slug is stored on create and on update; the same slug may be saved again", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = randomUUID();
    await save(db, admin, { id, slug: "  my-new-game  " });
    assert.equal(await slugOf(db, id), "my-new-game", "trimmed");
    await save(db, admin, { id, create: false, slug: "my-new-game" });
    assert.equal(await slugOf(db, id), "my-new-game", "same slug on the same row is not a duplicate");
    await save(db, admin, { id, create: false, slug: "my-renamed-game-2" });
    assert.equal(await slugOf(db, id), "my-renamed-game-2");
    await save(db, admin, { id: randomUUID(), slug: "x1y" });
    await save(db, admin, { id: randomUUID(), slug: "a".repeat(80) });
  }, { apply: ["055"] });
});

await check("invalid slugs are refused with 22023 and nothing is written", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = randomUUID();
    await save(db, admin, { id, title: "Before", slug: "good-slug" });
    const bad = [
      "Upper-Case", "has space", "double--hyphen", "-leading", "trailing-", "under_score", "ab", "a".repeat(81),
      "เกมสนุก", "slug/with/slash", "slug.dot", "123e4567-e89b-12d3-a456-426614174000", "emoji-🙂",
    ];
    for (const slug of bad) {
      const error = await failsWith(save(db, admin, { id, create: false, title: "After", slug }), /Resource slug is invalid/, `slug ${JSON.stringify(slug)}`);
      assert.equal(error.code, "22023", slug);
      await failsWith(save(db, admin, { id: randomUUID(), slug }), /Resource slug is invalid/, `create ${JSON.stringify(slug)}`);
    }
    const row = (await rows(db, "select title, slug from public.resources where id = $1", [id]))[0];
    assert.deepEqual(row, { title: "Before", slug: "good-slug" }, "failed saves change nothing");
    assert.equal((await rows(db, "select count(*)::int as n from public.resources where title = 'Slug Test'"))[0].n, 0, "no row was created by a refused create");
  }, { apply: ["055"] });
});

await check("the function accepts and refuses exactly the strings the application does (shared slug corpus)", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    // The corpus reuses real names such as sentence-train, which migration 053 already seeded.
    await db.exec("update public.resources set slug = null");
    for (const slug of slugCorpus.valid) {
      const id = randomUUID();
      await save(db, admin, { id, slug });
      assert.equal(await slugOf(db, id), slug, `valid ${JSON.stringify(slug)}`);
    }
    for (const slug of slugCorpus.invalid) {
      // The admin form's field is trimmed of spaces and a blank one means "no change";
      // everything else must be refused exactly like the column's own CHECK refuses it.
      if (slug.trim() === "" || slug !== slug.replace(/^ +| +$/g, "")) continue;
      await failsWith(save(db, admin, { id: randomUUID(), slug }), /Resource slug is invalid/, `invalid ${JSON.stringify(slug)}`);
    }
  }, { apply: ["055"] });
});

await check("a slug used by another resource is refused with 23505, on create and on update", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const first = randomUUID();
    const second = randomUUID();
    await save(db, admin, { id: first, title: "First", slug: "shared-name" });
    await save(db, admin, { id: second, title: "Second" });
    const onUpdate = await failsWith(save(db, admin, { id: second, create: false, title: "Second", slug: "shared-name" }), /Resource slug is already in use/, "update");
    assert.equal(onUpdate.code, "23505");
    const onCreate = await failsWith(save(db, admin, { id: randomUUID(), slug: "shared-name" }), /Resource slug is already in use/, "create");
    assert.equal(onCreate.code, "23505");
    assert.equal(await slugOf(db, second), null);
    // A seeded production slug is protected the same way.
    await failsWith(save(db, admin, { id: second, create: false, title: "Second", slug: "sentence-train" }), /already in use/, "seeded slug");
  }, { apply: ["055"] });
});

await check("the unique-index backstop reports a slug race as 'already in use' (other duplicates keep their own error)", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const target = randomUUID();
    const other = randomUUID();
    await save(db, admin, { id: target, title: "Target" });
    await save(db, admin, { id: other, title: "Other" });
    await failsWith(save(db, admin, { id: target, title: "Target again" }), /Resource already exists/, "same id twice keeps its own error");
    // A concurrent writer: after the function's own pre-check has passed, another row takes the slug.
    await db.exec(`
      create function public.test_slug_race() returns trigger language plpgsql security definer set search_path = '' as $$
      begin
        if new.slug = 'raced-slug' and new.id <> '${other}' then
          update public.resources set slug = 'raced-slug' where id = '${other}';
        end if;
        return new;
      end $$;
      create trigger test_slug_race before update on public.resources
        for each row execute function public.test_slug_race();
    `);
    const raced = await failsWith(save(db, admin, { id: target, create: false, title: "Target", slug: "raced-slug" }), /Resource slug is already in use/, "race");
    assert.equal(raced.code, "23505");
    assert.equal(await slugOf(db, target), null, "the loser keeps no slug");
    assert.equal(await slugOf(db, other), null, "and the whole save rolled back");
  }, { apply: ["055"] });
});

await check("guards: stops with a clear message, writing nothing, on a database 055 was not written for", async () => {
  await withDb(async (db) => {
    const before = await saveFunction(db);
    await db.exec("alter table public.resources drop constraint resources_slug_format; drop index public.resources_slug_key;");
    await db.exec("drop view public.resource_catalog cascade");
    await db.exec("alter table public.resources drop column slug");
    await failsWith(db.exec(migrationSql("055")), /Apply migration 053 first/, "no slug column");
    assert.deepEqual(await saveFunction(db), before, "function untouched");
  });
  await withDb(async (db) => {
    await db.exec(`drop function public.admin_save_resource(${OLD_ARGS})`);
    await failsWith(db.exec(migrationSql("055")), /expected exactly one public\.admin_save_resource.*found 0/s, "function missing");
    assert.equal((await saveFunction(db)).length, 0, "nothing was created");
  });
  await withDb(async (db) => {
    await db.exec("create function public.admin_save_resource(p_x integer) returns void language sql as 'select 1'");
    const before = await saveFunction(db);
    await failsWith(db.exec(migrationSql("055")), /expected exactly one public\.admin_save_resource.*found 2/s, "extra overload");
    assert.deepEqual(await saveFunction(db), before, "both functions still as they were");
  });
  await withDb(async (db) => {
    await db.exec(`drop function public.admin_save_resource(${OLD_ARGS})`);
    await db.exec("create function public.admin_save_resource(p_x integer) returns void language sql as 'select 1'");
    await failsWith(db.exec(migrationSql("055")), /signature this file does not recognise/, "unknown signature");
  });
});

await check("rollback restores migration 028's function byte for byte (grants too) and keeps saved slugs", async () => {
  await withDb(async (db) => {
    const original = await saveFunction(db);
    const admin = await addUser(db, "admin", "admin");
    await db.exec(migrationSql("055"));
    const id = randomUUID();
    await save(db, admin, { id, title: "Keeps slug", slug: "survives-rollback" });
    await db.exec(rollbackSql("055"));
    assert.deepEqual(await saveFunction(db), original, "identical source, config and grants as before 055");
    assert.equal(await slugOf(db, id), "survives-rollback", "saved slug untouched");
    assert.ok(notOk(await runVerification(db)).length > 0, "verification fails again after rollback");
    // The old console still works, and the new argument is refused until 055 is applied again.
    await save(db, admin, { id, create: false, title: "Still saves" });
    await failsWith(save(db, admin, { id, create: false, slug: "another-slug" }), /function public\.admin_save_resource\(.*\) does not exist/, "p_slug after rollback");
    await db.exec(migrationSql("055"));
    assert.deepEqual(notOk(await runVerification(db)), []);
    await save(db, admin, { id, create: false, slug: "another-slug" });
    assert.equal(await slugOf(db, id), "another-slug");
  });
});

await check("the rollback is harmless on a database that never had 055", async () => {
  await withDb(async (db) => {
    const before = await saveFunction(db);
    await db.exec(rollbackSql("055"));
    assert.deepEqual(await saveFunction(db), before);
  });
});

await check("053 and 054 still verify after 055 (it touches neither)", async () => {
  await withDb(async (db) => {
    await db.exec(migrationSql("055"));
    for (const name of ["053-verify", "054-verify"]) {
      const result = await rows(db, readFileSync(new URL(`../supabase/verification/${name}.sql`, import.meta.url), "utf8"));
      assert.deepEqual(notOk(result), [], name);
    }
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`failed:\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
