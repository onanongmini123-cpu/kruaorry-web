// Migrations 058 + 059 against the real chain in local PGlite. Synthetic rows
// only; never connects to Supabase.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, rollbackSql, rows } from "./lib/real-chain.mjs";

const verification = readFileSync(new URL("../supabase/verification/059-verify.sql", import.meta.url), "utf8");
let passed = 0;
const failures = [];
async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (e) { failures.push(name); console.log(`FAIL  ${name}\n        ${String(e?.message ?? e)}`); }
}
async function failsWith(promise, pattern, label) {
  let caught; try { await promise; } catch (e) { caught = e; }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught.message ?? caught), pattern, label);
}
async function addUser(db, label, role) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1,$2)", [id, `${label}@test.invalid`]);
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role=$2 where id=$1", [id, role]);
  await db.exec("set session_replication_role = origin");
  return id;
}
const acct = async (db, code) => (await rows(db, "select id from accounting.accounts where code=$1", [code]))[0].id;
async function txn(db, { type = "income", amount = 299, code = 4000, sim = false, desc = "test" }) {
  return (await rows(db, `insert into accounting.transactions
    (occurred_at, type, amount, account_id, description, recorded_by, is_simulated)
    values ('2026-11-10T03:00:00Z',$1,$2,$3,$4,'line',$5) returning id`,
    [type, amount, await acct(db, code), desc, sim]))[0].id;
}

const db = await chainDb("059");
const owner = await addUser(db, "owner", "owner");
const admin = await addUser(db, "admin", "admin");
const member = await addUser(db, "member", "member");

await check("verification SQL: every row ok", async () => {
  const r = await rows(db, verification);
  assert.ok(r.length === 6 && r.every((x) => x.ok), JSON.stringify(r.filter((x) => !x.ok)));
});

await check("owner can read; admin, member and anon cannot see any rows", async () => {
  await txn(db, {});
  assert.equal((await asRole(db, "authenticated", owner, () => rows(db, "select * from accounting.transactions"))).length, 1);
  for (const id of [admin, member])
    assert.equal((await asRole(db, "authenticated", id, () => rows(db, "select * from accounting.transactions"))).length, 0);
  await failsWith(asRole(db, "anon", null, () => rows(db, "select * from accounting.transactions")), /permission denied/, "anon");
});

await check("no direct writes from authenticated, even the owner", async () => {
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("update accounting.transactions set amount = 1")), /permission denied/, "owner update");
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("delete from accounting.audit_log")), /permission denied/, "audit delete");
});

await check("only the owner may approve; approving posts a balanced entry", async () => {
  const id = await txn(db, { amount: 299 });
  await failsWith(asRole(db, "authenticated", admin, () =>
    db.query("select accounting.approve_transaction($1,'approved')", [id])), /owner only/, "admin");
  await asRole(db, "authenticated", owner, () => db.query("select accounting.approve_transaction($1,'approved')", [id]));
  const lines = await rows(db, `select sum(debit)::int d, sum(credit)::int c from accounting.journal_lines jl
    join accounting.journal_entries je on je.id=jl.entry_id where je.transaction_id=$1`, [id]);
  assert.deepEqual(lines[0], { d: 299, c: 299 });
  const t = (await rows(db, "select status, approved_by from accounting.transactions where id=$1", [id]))[0];
  assert.equal(t.status, "approved"); assert.equal(t.approved_by, owner);
});

await check("cannot approve twice, cannot approve with a mismatched account", async () => {
  const id = await txn(db, { amount: 100 });
  await asRole(db, "authenticated", owner, () => db.query("select accounting.approve_transaction($1,'approved')", [id]));
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("select accounting.approve_transaction($1,'approved')", [id])), /already approved/, "twice");
  const bad = await txn(db, { type: "expense", amount: 50, code: 4000 });
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("select accounting.approve_transaction($1,'approved')", [bad])), /does not match/, "mismatch");
});

await check("approved rows are immutable; audit log is append-only", async () => {
  const id = await txn(db, { amount: 10 });
  await asRole(db, "authenticated", owner, () => db.query("select accounting.approve_transaction($1,'approved')", [id]));
  await failsWith(db.query("update accounting.transactions set amount = 99999 where id=$1", [id]), /immutable/, "edit");
  await failsWith(db.query("delete from accounting.transactions where id=$1", [id]), /immutable/, "delete");
  await failsWith(db.query("delete from accounting.audit_log"), /append-only/, "audit");
  assert.ok((await rows(db, "select 1 from accounting.audit_log where row_id=$1 and action='UPDATE'", [id])).length >= 1);
});

await check("unbalanced journal entry cannot be approved", async () => {
  const je = (await rows(db, "insert into accounting.journal_entries (entry_date, memo) values ('2026-11-10','x') returning id"))[0].id;
  await db.query("insert into accounting.journal_lines (entry_id, account_id, debit) values ($1,$2,100)", [je, await acct(db, 1000)]);
  await failsWith(db.query("update accounting.journal_entries set status='approved' where id=$1", [je]), /not balanced/, "unbalanced");
});

await check("service approval path: service_role only, owner profile required", async () => {
  const id = await txn(db, { amount: 20 });
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("select accounting.approve_transaction_service($1,$2,'approved')", [owner, id])), /permission denied/, "authenticated");
  await failsWith(asRole(db, "service_role", null, () =>
    db.query("select accounting.approve_transaction_service($1,$2,'approved')", [member, id])), /not an owner/, "non-owner");
  await asRole(db, "service_role", null, () =>
    db.query("select accounting.approve_transaction_service($1,$2,'approved')", [owner, id]));
});

await check("void reverses the entry and the dashboard nets to zero for it", async () => {
  const before = (await asRole(db, "authenticated", owner, () =>
    rows(db, "select accounting.dashboard_summary('2026-11-01','2026-11-30') s")))[0].s.total_revenue;
  const id = await txn(db, { amount: 500 });
  await asRole(db, "authenticated", owner, () => db.query("select accounting.approve_transaction($1,'approved')", [id]));
  await failsWith(asRole(db, "authenticated", owner, () =>
    db.query("select accounting.void_transaction($1,'')", [id])), /reason/, "reason");
  await asRole(db, "authenticated", owner, () => db.query("select accounting.void_transaction($1,'duplicate')", [id]));
  const after = (await asRole(db, "authenticated", owner, () =>
    rows(db, "select accounting.dashboard_summary('2026-11-01','2026-11-30') s")))[0].s.total_revenue;
  assert.equal(Number(after), Number(before));
});

await check("dashboard counts real approved rows only; pending and simulated are separate", async () => {
  const real = await txn(db, { amount: 1000, code: 4100 });
  const sim = await txn(db, { amount: 7777, code: 4100, sim: true });
  await txn(db, { amount: 123, code: 4100 }); // stays pending
  const exp = await txn(db, { type: "expense", amount: 400, code: 6100 });
  for (const id of [real, exp])
    await asRole(db, "authenticated", owner, () => db.query("select accounting.approve_transaction($1,'approved')", [id]));
  await asRole(db, "service_role", null, () => db.query("select accounting.approve_transaction_service($1,$2,'approved')", [owner, sim]));
  const s = (await asRole(db, "authenticated", owner, () =>
    rows(db, "select accounting.dashboard_summary('2026-11-01','2026-11-30') s")))[0].s;
  assert.equal(Number(s.sales_by_channel["4100"]), 1000);
  assert.ok(s.pending_transactions.count >= 1);
  assert.ok(s.simulated_rows_excluded >= 1);
  assert.equal(Number(s.net_profit), Number(s.total_revenue) - 400);
  await failsWith(asRole(db, "authenticated", member, () =>
    db.query("select accounting.dashboard_summary('2026-11-01','2026-11-30')")), /owner only/, "member");
});

await check("evidence bucket is private and readable only by the owner", async () => {
  await db.exec(`insert into storage.objects (bucket_id, name) values ('accounting-evidence','a/slip.png')`);
  assert.equal((await asRole(db, "authenticated", owner, () => rows(db, "select 1 from storage.objects where bucket_id='accounting-evidence'"))).length, 1);
  assert.equal((await asRole(db, "authenticated", member, () => rows(db, "select 1 from storage.objects where bucket_id='accounting-evidence'"))).length, 0);
});

await check("rollback of 059 leaves 058 objects intact", async () => {
  await db.exec("delete from storage.objects where bucket_id='accounting-evidence'");
  await db.exec(rollbackSql("059"));
  assert.equal((await rows(db, "select count(*)::int n from accounting.accounts"))[0].n, 17);
  assert.equal((await rows(db, "select to_regprocedure('accounting.dashboard_summary(date,date)') f"))[0].f, null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
