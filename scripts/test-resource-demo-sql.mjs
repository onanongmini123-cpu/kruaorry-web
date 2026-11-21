// Migration 061 (resource demo URL) against the REAL migration chain: 001..057 are
// replayed in-process by PGlite with Supabase-like roles. Local only: it never
// connects to a remote database, needs no credentials and uses synthetic rows.
//
//   npm run test:resource-demo-sql
//
// What it proves
//   * the same accept/reject corpus as src/lib/resourceDemoUrl.ts (vitest) gives
//     the same answer in PostgreSQL (the two rule sets cannot drift apart)
//   * only admins can set a demo; anon and members are refused
//   * the demo is public (resource_demo_catalog, anon) but cta_url / file_path stay private
//     and resource_catalog is not touched (unmerged 058-060 also change it)
//   * it applies cleanly AFTER the unmerged 058-060 files of release/pro-features-batch-1 (the required order)
//   * a Pro resource's full version is untouched: resolve_resource_target, every RLS
//     policy (including Storage) and admin_save_resource are byte-for-byte the same
//   * a demo can never equal the full version's own URL
//   * re-running is a no-op, guards stop a wrong database, rollback restores the view
//   * supabase/verification/061-verify.sql separates "not applied" from "applied"
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, fromSnapshot, migrationSql, rollbackSql, rows, snapshotOf } from "./lib/real-chain.mjs";

const corpus = JSON.parse(readFileSync(new URL("../src/lib/__tests__/fixtures/demo-url-corpus.json", import.meta.url), "utf8"));
const verification = readFileSync(new URL("../supabase/verification/061-verify.sql", import.meta.url), "utf8");

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
  let caught = null;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected an error but the statement succeeded`);
  assert.match(String(caught.message ?? caught), pattern, `${label}: unexpected error "${String(caught.message).split("\n")[0]}"`);
}

console.log("replaying migrations 001..057 …");
const baseDb = await chainDb("057");
const baseSnapshot = await snapshotOf(baseDb);
await baseDb.close();

async function withDb(run, { apply = true } = {}) {
  const db = await fromSnapshot(baseSnapshot);
  try {
    if (apply) await db.exec(migrationSql("061"));
    return await run(db);
  } finally {
    await db.close();
  }
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

async function addResource(db, { title, status = "published", accessMode = "public", ctaUrl = "/qa-tool" }) {
  const id = randomUUID();
  await db.query(
    `insert into public.resources (id, title, delivery_mode, status, access_mode, cta_url, cover_image_url)
     values ($1, $2, 'web_app', $3, $4, $5, '/qa-cover.webp')`,
    [id, title, status, accessMode, ctaUrl],
  );
  return id;
}

const setDemo = (db, admin, id, url) => asRole(db, "authenticated", admin, () => db.query("select public.admin_set_resource_demo($1, $2)", [id, url]));
const notOk = (result) => result.filter((row) => row.ok !== true).map((row) => `${row.check_name} :: ${row.detail}`);

async function protectedSurface(db) {
  return {
    policies: await rows(db, "select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies order by 1, 2, 3"),
    functions: await rows(db, `
      select p.oid::regprocedure::text as sig, md5(p.prosrc) as src, p.proacl::text as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('admin_save_resource', 'resolve_resource_target', 'can_access_resource', 'resource_file_read_allowed', 'set_resource_access', 'is_admin', 'has_feature')
      order by 1`),
    buckets: await rows(db, "select id, public, file_size_limit from storage.buckets order by 1").catch(() => []),
  };
}

await check("verification reports 'not applied' before 061 and all ok after", async () => {
  await withDb(async (db) => {
    assert.ok(notOk(await rows(db, verification)).length > 0, "verification must fail before 061");
    await db.exec(migrationSql("061"));
    assert.deepEqual(notOk(await rows(db, verification)), []);
  }, { apply: false });
});

await check("the accept corpus is stored, the reject corpus is refused (parity with src/lib/resourceDemoUrl.ts)", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = await addResource(db, { title: "Corpus" });
    for (const url of corpus.accept) {
      await setDemo(db, admin, id, url);
      const [{ demo_url: saved }] = await rows(db, "select demo_url from public.resources where id = $1", [id]);
      assert.equal(saved, url, `accepted: ${url}`);
    }
    for (const url of corpus.reject.filter((value) => value.trim() !== "")) {
      await failsWith(setDemo(db, admin, id, url), /Resource demo URL is invalid/, `rejected: ${JSON.stringify(url)}`);
    }
    await setDemo(db, admin, id, "   ");
    assert.equal((await rows(db, "select demo_url from public.resources where id = $1", [id]))[0].demo_url, null, "blank clears the demo");
  });
});

await check("the CHECK constraint refuses an unsafe URL even by a direct update", async () => {
  await withDb(async (db) => {
    const id = await addResource(db, { title: "Direct" });
    for (const url of ["http://games.kruaorry.com/x", "https://localhost/x", "https://abc.vercel.app/x"]) {
      await failsWith(db.query("update public.resources set demo_url = $2 where id = $1", [id, url]), /resources_demo_url_safe/, url);
    }
    await db.query("update public.resources set demo_url = 'https://games.kruaorry.com/demo/a' where id = $1", [id]);
  });
});

await check("only an admin may set a demo; anon and members are refused", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const member = await addUser(db, "member");
    const id = await addResource(db, { title: "Perm" });
    await failsWith(setDemo(db, member, id, "https://games.kruaorry.com/demo/a"), /Admin access required/, "member");
    await failsWith(asRole(db, "anon", null, () => db.query("select public.admin_set_resource_demo($1, $2)", [id, "https://games.kruaorry.com/demo/a"])), /permission denied/i, "anon");
    await setDemo(db, admin, id, "https://games.kruaorry.com/demo/a");
    // RLS filters the row out for a member, so the UPDATE matches nothing (no error) and changes nothing.
    await asRole(db, "authenticated", member, () => db.query("update public.resources set demo_url = 'https://games.kruaorry.com/demo/b' where id = $1", [id])).catch(() => null);
    assert.equal((await rows(db, "select demo_url from public.resources where id = $1", [id]))[0].demo_url, "https://games.kruaorry.com/demo/a", "member write did not change anything");
    await failsWith(setDemo(db, admin, randomUUID(), "https://games.kruaorry.com/demo/a"), /Resource not found/, "unknown resource");
  });
});

await check("the demo is public through resource_demo_catalog only; cta_url and file_path stay private", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const pro = await addResource(db, { title: "Pro game", accessMode: "plans", ctaUrl: "https://games.kruaorry.com/full/pro-game" });
    const draft = await addResource(db, { title: "Draft game", status: "draft", accessMode: "locked" });
    await setDemo(db, admin, pro, "https://games.kruaorry.com/demo/pro-game");
    await setDemo(db, admin, draft, "https://games.kruaorry.com/demo/draft-game");

    const seen = await asRole(db, "anon", null, () => rows(db, "select resource_id, demo_url from public.resource_demo_catalog order by demo_url"));
    assert.deepEqual(seen.map((row) => [row.resource_id, row.demo_url]), [[pro, "https://games.kruaorry.com/demo/pro-game"]], "anon sees the published demo only (never the draft's)");
    await failsWith(asRole(db, "anon", null, () => db.query("select demo_url from public.resources")), /permission denied/i, "anon table demo_url");

    await failsWith(asRole(db, "anon", null, () => db.query("select cta_url from public.resources")), /permission denied/i, "anon cta_url");
    await failsWith(asRole(db, "authenticated", await addUser(db, "m"), () => db.query("select file_path from public.resources")), /permission denied/i, "member file_path");
    for (const view of ["resource_catalog", "resource_demo_catalog"]) {
      const columns = (await rows(db, "select column_name from information_schema.columns where table_name = $1", [view])).map((row) => row.column_name);
      assert.ok(!columns.includes("cta_url") && !columns.includes("file_path"), `${view} exposes no private target`);
    }
    assert.ok(!(await rows(db, "select column_name from information_schema.columns where table_name = 'resource_catalog'")).some((row) => row.column_name === "demo_url"), "resource_catalog is untouched");
  });
});

await check("a demo can never be the full version's own URL (function and constraint)", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = await addResource(db, { title: "Same", accessMode: "plans", ctaUrl: "https://games.kruaorry.com/full/x" });
    await failsWith(setDemo(db, admin, id, "https://games.kruaorry.com/full/x"), /must differ/, "same url");
    await failsWith(setDemo(db, admin, id, "https://GAMES.kruaorry.com/full/x/"), /must differ/, "same url, case and trailing slash");
    await setDemo(db, admin, id, "https://games.kruaorry.com/demo/x");
    await failsWith(db.query("update public.resources set cta_url = 'https://games.kruaorry.com/demo/x/' where id = $1", [id]), /resources_demo_differs_from_full/, "full url edited to equal the demo");
  });
});

await check("Pro full-version access is untouched: policies, Storage, resolver and save function are identical", async () => {
  await withDb(async (db) => {
    const before = await protectedSurface(db);
    await db.exec(migrationSql("061"));
    const after = await protectedSurface(db);
    assert.deepEqual(after, before);

    const member = await addUser(db, "free-member");
    const pro = await addResource(db, { title: "Pro", accessMode: "plans", ctaUrl: "https://games.kruaorry.com/full/pro" });
    const admin = await addUser(db, "admin", "admin");
    await setDemo(db, admin, pro, "https://games.kruaorry.com/demo/pro");
    const asMember = await asRole(db, "authenticated", member, () => rows(db, "select * from public.resolve_resource_target($1)", [pro]));
    assert.deepEqual(asMember, [], "a free member still gets no full-version target for a Pro resource");
    const asAnon = await asRole(db, "anon", null, () => rows(db, "select * from public.resolve_resource_target($1)", [pro])).catch(() => []);
    assert.deepEqual(asAnon, [], "anon still gets no full-version target");
  }, { apply: false });
});

await check("re-running 061 is a no-op; a wrong database is stopped before anything is written", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = await addResource(db, { title: "Rerun" });
    await setDemo(db, admin, id, "https://games.kruaorry.com/demo/a");
    await db.exec(migrationSql("061"));
    assert.equal((await rows(db, "select demo_url from public.resources where id = $1", [id]))[0].demo_url, "https://games.kruaorry.com/demo/a");
    assert.deepEqual(notOk(await rows(db, verification)), []);
  });
  const db = await fromSnapshot(baseSnapshot);
  try {
    await db.exec("alter table public.resources drop column slug cascade");
    await failsWith(db.exec(migrationSql("061")), /061: public\.resources\.slug is missing/, "missing 053");
  } finally {
    await db.close();
  }
});

await check("rollback drops the view, column and functions, and 061 re-applies", async () => {
  await withDb(async (db) => {
    const admin = await addUser(db, "admin", "admin");
    const id = await addResource(db, { title: "Rollback" });
    await setDemo(db, admin, id, "https://games.kruaorry.com/demo/a");
    const before = await protectedSurface(db);
    await db.exec(rollbackSql("061"));
    assert.equal((await rows(db, "select count(*)::int as n from information_schema.columns where table_name = 'resources' and column_name = 'demo_url'"))[0].n, 0);
    assert.equal((await rows(db, "select count(*)::int as n from pg_class where relname = 'resource_demo_catalog'"))[0].n, 0);
    assert.equal((await rows(db, "select count(*)::int as n from pg_proc where proname in ('admin_set_resource_demo','resource_demo_url_is_safe')"))[0].n, 0);
    assert.ok(notOk(await rows(db, verification)).length > 0, "verification reports 'not applied' after rollback");
    await db.exec(rollbackSql("061"));
    await db.exec(migrationSql("061"));
    assert.deepEqual(notOk(await rows(db, verification)), []);
    assert.ok(before.functions.length > 0);
  });
});

await check("applies cleanly after the unmerged 058-060 of release/pro-features-batch-1 (required order; resource_catalog untouched)", async () => {
  const { execFileSync } = await import("node:child_process");
  const ref = "origin/release/pro-features-batch-1";
  let files;
  try {
    files = execFileSync("git", ["ls-tree", "--name-only", ref, "supabase/migrations/"], { encoding: "utf8" })
      .split("\n").filter((name) => /_(058|059|060)_/.test(name));
  } catch {
    console.log("      (skipped: " + ref + " is not available in this clone)");
    return;
  }
  assert.equal(files.length, 3, "found the three unmerged files");
  await withDb(async (db) => {
    for (const file of files) await db.exec(execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" }));
    const viewBefore = (await rows(db, "select pg_get_viewdef('public.resource_catalog'::regclass, true) as def"))[0].def;
    await db.exec(migrationSql("061"));
    const viewAfter = (await rows(db, "select pg_get_viewdef('public.resource_catalog'::regclass, true) as def"))[0].def;
    assert.equal(viewAfter, viewBefore, "resource_catalog is byte-identical after 061");
    assert.deepEqual(notOk(await rows(db, verification)), []);
    const admin = await addUser(db, "admin", "admin");
    const id = await addResource(db, { title: "Batch" });
    await setDemo(db, admin, id, "https://games.kruaorry.com/demo/a");
  }, { apply: false });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((name) => `  - ${name}`).join("\n"));
  process.exit(1);
}
