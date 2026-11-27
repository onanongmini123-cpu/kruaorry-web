import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, migrationSql, rollbackSql, rows } from "./lib/real-chain.mjs";

// 066 on the REAL migration chain (001-064) in PGlite, with Supabase-like roles and the
// storage stand-in. 066 does not need 065. PGlite has no pg_safeupdate; the "explicit
// WHERE" rule is checked by src/lib/__tests__/functionBodiesHaveWhere.test.ts.
// Local only: this script never connects to a remote database.
const m066 = migrationSql("066");
const rollback = rollbackSql("066");
const verification = readFileSync(new URL("../supabase/verification/066-verify.sql", import.meta.url), "utf8");

const db = await chainDb("064");
const checks = async () => rows(db, verification);
for (const check of await checks()) assert.equal(check.ok, false, `before 066: ${check.check_name} is false, not an error`);

for (let run = 0; run < 2; run += 1) await db.exec(m066);
for (const check of await checks()) assert.equal(check.ok, true, `verification: ${check.check_name}`);

// ---------------------------------------------------------------- helpers

async function addUser(label, role) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}@test.invalid`]);
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
  await db.exec("set session_replication_role = origin");
  return id;
}
const owner = await addUser("owner", "owner");
const admin = await addUser("admin", "admin");
const member = await addUser("member", "member");

async function denied(promise, pattern, label) {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught?.message ?? caught), pattern, label);
  return caught;
}
const as = (uid, fn) => asRole(db, "authenticated", uid, fn);
const one = async (sql, params = []) => (await rows(db, sql, params))[0];
const today = (await one("select public.owner_finance_today()::text as d")).d;
const dayOffset = async (n) => (await one("select (public.owner_finance_today() - $1::int)::text as d", [n])).d;
const yesterday = await dayOffset(1);
const tomorrow = await dayOffset(-1);

const add = (uid, o) => as(uid, async () => (await one(
  "select public.owner_add_finance_entry($1, $2, $3, $4, $5, $6, $7, $8, $9) as id",
  [o.id ?? randomUUID(), o.kind ?? "income", o.amount ?? 10000, o.on ?? today, o.category ?? "อบรม",
    o.channel ?? null, o.note ?? null, o.ref ?? null, o.receipt ?? null],
)).id);
const voidEntry = (uid, id, reason = "กรอกผิด") => as(uid, () => rows(db, "select public.owner_void_finance_entry($1, $2)", [id, reason]));
const attach = (uid, id, path) => as(uid, () => rows(db, "select public.owner_attach_finance_receipt($1, $2)", [id, path]));
const saveRecurring = (uid, o) => as(uid, async () => (await one(
  "select public.owner_save_recurring_expense($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id",
  [o.id, o.create ?? true, o.category ?? "Vercel", o.amount ?? 70000, o.day ?? 5, o.starts ?? "2024-01-01",
    o.ends ?? null, o.channel ?? "บัตรเครดิต", o.note ?? null, o.active ?? true],
)).id);
const markPaid = (uid, o) => as(uid, async () => (await one(
  "select public.owner_mark_recurring_expense_paid($1, $2, $3, $4, $5, $6) as id",
  [o.recurring, o.month, o.id ?? randomUUID(), o.amount ?? null, o.on ?? null, o.receipt ?? null],
)).id);
const due = (uid, month) => as(uid, async () => (await one(
  month === undefined ? "select public.owner_recurring_expenses_due() as d" : "select public.owner_recurring_expenses_due($1) as d",
  month === undefined ? [] : [month],
)).d);
const putObject = (name) => db.query(
  "insert into storage.objects (bucket_id, name, owner_id) values ('owner-expense-receipts', $1, $2)", [name, owner]);
const receiptName = (entryId, ext = "jpg") => `entries/${entryId}/${randomUUID()}.${ext}`;
const auditCount = async () => (await one("select count(*)::int as n from public.owner_finance_audit")).n;

// ---------------------------------------------------------------- recording money (owner)

const income = await add(owner, { kind: "income", amount: 150000, category: "อบรม", channel: "LINE", note: "อบรมครู", ref: "INV-001" });
const expense = await add(owner, { kind: "expense", amount: 70000, category: "Vercel", channel: "บัตรเครดิต", on: yesterday });
const refund = await add(owner, { kind: "refund", amount: 50000, category: "อบรม", ref: "INV-001" });
const r = await one("select * from public.owner_manual_finance_entries where id = $1", [income]);
assert.equal(String(r.amount_satang), "150000", "amounts are stored in satang");
assert.equal(r.channel, "LINE");
assert.equal(r.created_by, owner);
assert.equal(await auditCount(), 3, "each new entry is audited");
// Free-text category and channel, trimmed.
const free = await add(owner, { kind: "income", category: "  ขายชีท  ", channel: "  Shopee " });
const freeRow = await one("select category, channel from public.owner_manual_finance_entries where id = $1", [free]);
assert.deepEqual([freeRow.category, freeRow.channel], ["ขายชีท", "Shopee"]);

// The owner reads all three tables; nobody else sees a row.
assert.equal((await as(owner, () => rows(db, "select id from public.owner_manual_finance_entries"))).length, 4);
for (const [uid, label] of [[admin, "admin (not owner)"], [member, "member"]]) {
  for (const table of ["owner_manual_finance_entries", "owner_recurring_expenses", "owner_finance_audit"]) {
    assert.equal((await as(uid, () => rows(db, `select * from public.${table}`))).length, 0, `${label} sees no ${table}`);
  }
}
for (const table of ["owner_manual_finance_entries", "owner_recurring_expenses", "owner_finance_audit"]) {
  await denied(asRole(db, "anon", null, () => rows(db, `select * from public.${table}`)), /permission denied/, `anon cannot read ${table}`);
}

// Direct writes are refused for everyone, even the owner (functions only, so every change is audited).
for (const uid of [owner, admin, member]) {
  await denied(as(uid, () => rows(db, "insert into public.owner_manual_finance_entries (id, kind, amount_satang, occurred_on, category) values ($1, 'income', 1, current_date, 'x')", [randomUUID()])), /permission denied/, "no direct insert");
  await denied(as(uid, () => rows(db, "update public.owner_manual_finance_entries set amount_satang = 1 where id = $1", [income])), /permission denied/, "no direct update");
  await denied(as(uid, () => rows(db, "delete from public.owner_manual_finance_entries where id = $1", [income])), /permission denied/, "no direct delete");
  await denied(as(uid, () => rows(db, "insert into public.owner_finance_audit (action, entity_type, entity_id) values ('entry_create', 'entry', $1)", [income])), /permission denied/, "no direct audit insert");
}

// Every function refuses admins and members (42501) and anon cannot call them at all.
const calls = [
  ["add", (uid) => add(uid, {})],
  ["void", (uid) => voidEntry(uid, income)],
  ["attach", (uid) => attach(uid, income, receiptName(income))],
  ["save recurring", (uid) => saveRecurring(uid, { id: randomUUID() })],
  ["mark paid", (uid) => markPaid(uid, { recurring: randomUUID(), month: today })],
  ["due list", (uid) => due(uid)],
];
for (const [name, call] of calls) {
  for (const [uid, label] of [[admin, "admin"], [member, "member"]]) {
    const error = await denied(call(uid), /Only the site owner/, `${label} ${name}`);
    assert.equal(error.code, "42501", `${label} ${name}: 42501`);
  }
}
for (const sql of [
  "select public.owner_add_finance_entry(gen_random_uuid(), 'income', 1, current_date, 'x')",
  "select public.owner_void_finance_entry(gen_random_uuid(), 'x')",
  "select public.owner_recurring_expenses_due()",
  "select public.owner_finance_today()",
]) {
  await denied(asRole(db, "anon", null, () => rows(db, sql)), /permission denied/, `anon: ${sql}`);
}
await denied(as(owner, () => rows(db, "select public.owner_finance_today()")), /permission denied/, "internal helpers are not callable from the browser");
assert.equal(await auditCount(), 4, "refused calls write nothing");

// ---------------------------------------------------------------- validation

for (const [o, pattern, label] of [
  [{ kind: "gift" }, /Kind must be/, "unknown kind"],
  [{ amount: 0 }, /Amount must be more than 0/, "zero amount"],
  [{ amount: -5 }, /Amount must be more than 0/, "negative amount"],
  [{ amount: 10000000001 }, /at most 100,000,000 baht/, "too large"],
  [{ on: tomorrow }, /between 2024-01-01 and today/, "future date"],
  [{ on: "2023-12-31" }, /between 2024-01-01 and today/, "before 2024"],
  [{ category: "   " }, /Category is required/, "blank category"],
  [{ category: "ก".repeat(61) }, /Category is required/, "long category"],
  [{ channel: "x".repeat(61) }, /Channel must be/, "long channel"],
  [{ note: "x".repeat(501) }, /Note must be/, "long note"],
  [{ ref: "x".repeat(121) }, /Reference must be/, "long reference"],
]) await denied(add(owner, o), pattern, label);
await denied(add(owner, { id: income }), /already exists/, "same entry id twice");

// References: one live entry per kind; case and spaces do not matter.
await denied(add(owner, { kind: "income", ref: " inv-001 " }), /already recorded/, "duplicate income reference");
await denied(add(owner, { kind: "refund", ref: "INV-001" }), /already recorded/, "duplicate refund reference");
await add(owner, { kind: "expense", ref: "INV-001" }); // other kinds may quote it

// Confirmed membership payments are counted automatically: income with their reference is refused.
await db.query(`insert into public.membership_payment_confirmations
  (idempotency_key, operation, plan_id, amount_thb, payment_reference, application_reference_code, paid_at, confirmed_at, confirmed_by)
  values (gen_random_uuid(), 'activation', (select id from public.plans order by id limit 1), 990, 'SLIP-777', 'KA-00000042', now(), now(), $1)`, [owner])
  .catch(async (error) => { throw new Error(`seed confirmation: ${error.message}`); });
for (const ref of ["SLIP-777", "slip-777 ", "KA-00000042"]) {
  const error = await denied(add(owner, { kind: "income", ref }), /already counted automatically/, `membership reference ${ref}`);
  assert.equal(error.code, "23505");
}
await add(owner, { kind: "refund", ref: "SLIP-777" }); // a refund of that membership is recorded by hand

// ---------------------------------------------------------------- void instead of edit

await denied(voidEntry(owner, income, "  "), /reason is required/, "void needs a reason");
await denied(voidEntry(owner, randomUUID()), /not found/, "void unknown entry");
const before = await auditCount();
await voidEntry(owner, income, "ยอดผิด");
await denied(voidEntry(owner, income), /already voided/, "void twice");
assert.equal(await auditCount(), before + 1);
const voidAudit = await one("select old_summary, new_summary from public.owner_finance_audit where action = 'entry_void' and entity_id = $1", [income]);
assert.equal(voidAudit.old_summary.voided, false);
assert.equal(voidAudit.new_summary.voided, true);
assert.equal(voidAudit.new_summary.void_reason, "ยอดผิด");
const replacement = await add(owner, { kind: "income", amount: 160000, ref: "INV-001" });
assert.ok(replacement, "after a void the same reference can be recorded again");

// Even with table rights, rows cannot be edited, un-voided or deleted, and the audit cannot change.
await denied(db.query("update public.owner_manual_finance_entries set amount_satang = 1 where id = $1", [expense]), /cannot be edited/, "trigger: no edit");
await denied(db.query("update public.owner_manual_finance_entries set voided_at = null, voided_by = null, void_reason = null where id = $1", [income]), /voided entry cannot change/, "trigger: no un-void");
await denied(db.query("delete from public.owner_manual_finance_entries where id = $1", [expense]), /never deleted/, "trigger: no delete");
await denied(db.query("update public.owner_finance_audit set action = 'entry_void' where entity_id = $1", [expense]), /append-only/, "audit: no update");
await denied(db.query("delete from public.owner_finance_audit where entity_id = $1", [expense]), /append-only/, "audit: no delete");

// ---------------------------------------------------------------- receipts

await denied(attach(owner, expense, "receipts/x.jpg"), /under entries\/<entry id>/, "wrong folder");
await denied(attach(owner, expense, receiptName(refund)), /under entries\/<entry id>/, "another entry's folder");
await denied(attach(owner, expense, receiptName(expense, "gif")), /under entries\/<entry id>/, "gif is not accepted");
await denied(attach(owner, expense, receiptName(expense)), /Receipt file not found/, "file must be uploaded first");
const slip = receiptName(expense, "pdf");
await putObject(slip);
await attach(owner, expense, slip);
await denied(attach(owner, expense, slip), /already has a receipt/, "a receipt is never replaced");
await denied(attach(owner, income, receiptName(income)), /voided entry cannot change/, "no receipt on a voided entry");
const receiptAudit = await one("select new_summary from public.owner_finance_audit where action = 'entry_receipt' and entity_id = $1", [expense]);
assert.equal(receiptAudit.new_summary.has_receipt, true);
assert.ok(!JSON.stringify(await rows(db, "select old_summary, new_summary from public.owner_finance_audit")).includes("entries/"), "the audit never stores a receipt path or link");
// A receipt at creation time.
const withSlipId = randomUUID();
const withSlip = receiptName(withSlipId, "webp");
await putObject(withSlip);
await add(owner, { id: withSlipId, kind: "expense", category: "AI", receipt: withSlip });

// Bucket policies: the owner uploads and reads, nobody else; used receipts cannot be deleted.
const bucket = await one("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'owner-expense-receipts'");
assert.equal(bucket.public, false);
assert.equal(String(bucket.file_size_limit), "5242880");
assert.deepEqual(bucket.allowed_mime_types, ["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const upload = (uid, name) => as(uid, () => rows(db, "insert into storage.objects (bucket_id, name, owner_id) values ('owner-expense-receipts', $1, $2)", [name, uid]));
const draftEntry = randomUUID();
const unused = receiptName(draftEntry, "png");
await upload(owner, unused);
for (const uid of [admin, member]) await denied(upload(uid, receiptName(draftEntry)), /row-level security/, "only the owner uploads");
await denied(upload(owner, `other/${randomUUID()}.jpg`), /row-level security/, "uploads stay under entries/");
const visible = async (uid) => (await as(uid, () => rows(db, "select name from storage.objects where bucket_id = 'owner-expense-receipts'"))).length;
assert.equal(await visible(owner), 3);
assert.equal(await visible(admin), 0, "admin cannot list receipts");
assert.equal(await visible(member), 0, "member cannot list receipts");
const deleteObject = (uid, name) => as(uid, () => rows(db, "delete from storage.objects where bucket_id = 'owner-expense-receipts' and name = $1 returning name", [name]));
assert.equal((await deleteObject(owner, slip)).length, 0, "a receipt that belongs to an entry cannot be deleted");
assert.equal((await deleteObject(member, unused)).length, 0, "member cannot delete");
assert.equal((await deleteObject(owner, unused)).length, 1, "an unused upload can be deleted");
await denied(as(owner, () => rows(db, "update storage.objects set name = $1 where name = $2", [receiptName(expense), slip])).then((r) => {
  if (r.length === 0) throw new Error("row-level security: nothing updated");
}), /row-level security|nothing updated/, "receipts are never overwritten");

// ---------------------------------------------------------------- recurring expenses (reminders)

const vercel = randomUUID();
const domain = randomUUID();
await saveRecurring(owner, { id: vercel, category: "Vercel", amount: 70000, day: 5 });
await saveRecurring(owner, { id: domain, category: "โดเมน", amount: 45000, day: 31, starts: "2026-01-01" });
await denied(saveRecurring(owner, { id: vercel }), /already exists/, "same recurring id twice");
await denied(saveRecurring(owner, { id: randomUUID(), day: 0 }), /Day of month/, "day 0");
await denied(saveRecurring(owner, { id: randomUUID(), day: 32 }), /Day of month/, "day 32");
await denied(saveRecurring(owner, { id: randomUUID(), starts: "2026-02-01", ends: "2026-01-01" }), /End date/, "end before start");
await denied(saveRecurring(owner, { id: randomUUID(), create: false }), /not found/, "update unknown");

const expensesBefore = (await one("select count(*)::int as n from public.owner_manual_finance_entries where recurring_expense_id is not null")).n;
assert.equal(expensesBefore, 0, "a reminder is not an expense");

// Day 31 falls on the last day of shorter months, including leap years.
const dueOn = async (month, day) => (await one("select public.owner_recurring_due_on($1::date, $2::smallint)::text as d", [month, day])).d;
assert.equal(await dueOn("2026-02-01", 31), "2026-02-28");
assert.equal(await dueOn("2028-02-10", 31), "2028-02-29", "leap year");
assert.equal(await dueOn("2026-04-01", 31), "2026-04-30");
assert.equal(await dueOn("2026-01-01", 5), "2026-01-05");

let list = await due(owner, "2026-02-01");
assert.equal(list.month, "2026-02-01");
assert.deepEqual(list.items.map((i) => [i.category, i.due_on]), [["Vercel", "2026-02-05"], ["โดเมน", "2026-02-28"]]);
assert.ok(list.items.every((i) => i.status === "overdue" && i.paid === false), "past unpaid months are overdue");
assert.equal(list.due_unpaid_count, 2);
assert.equal((await due(owner, "2025-12-01")).items.length, 1, "an item does not show before it starts");

// "จ่ายแล้ว" records one real expense for that month.
const paid = await markPaid(owner, { recurring: vercel, month: "2026-02-17" });
const paidRow = await one("select * from public.owner_manual_finance_entries where id = $1", [paid]);
assert.equal(paidRow.kind, "expense");
assert.equal(String(paidRow.amount_satang), "70000", "defaults to the reminder amount");
assert.equal(paidRow.category, "Vercel");
assert.equal(paidRow.recurring_due_month.toISOString().slice(0, 10), "2026-02-01");
await denied(markPaid(owner, { recurring: vercel, month: "2026-02-01" }), /already marked paid/, "a month is paid once");
list = await due(owner, "2026-02-01");
assert.deepEqual(list.items.map((i) => i.status), ["paid", "overdue"]);
assert.equal(list.items[0].entry_id, paid);
assert.equal(list.due_unpaid_count, 1);
// Voiding the payment brings the reminder back; it can be paid again with another amount.
await voidEntry(owner, paid, "จ่ายซ้ำ");
assert.equal((await due(owner, "2026-02-01")).items[0].paid, false);
const repaid = await markPaid(owner, { recurring: vercel, month: "2026-02-01", amount: 72000, on: "2026-02-06" });
assert.equal(String((await one("select amount_satang from public.owner_manual_finance_entries where id = $1", [repaid])).amount_satang), "72000");
await denied(markPaid(owner, { recurring: vercel, month: tomorrow.slice(0, 7) === today.slice(0, 7) ? (await dayOffset(-40)) : tomorrow }), /future month/, "future month");
await denied(markPaid(owner, { recurring: domain, month: "2025-12-01" }), /not due in that month/, "before it starts");
await denied(markPaid(owner, { recurring: randomUUID(), month: "2026-02-01" }), /not found/, "unknown reminder");

// Editing a reminder changes future reminders only; paid months keep their expense. Inactive = no reminder.
await saveRecurring(owner, { id: vercel, create: false, category: "Vercel Pro", amount: 80000, day: 10, active: false });
assert.equal((await due(owner, "2026-02-01")).items.length, 1, "inactive items are not reminded");
assert.equal(String((await one("select amount_satang from public.owner_manual_finance_entries where id = $1", [repaid])).amount_satang), "72000");
await denied(markPaid(owner, { recurring: vercel, month: "2026-03-01" }), /not due in that month/, "inactive cannot be paid");
const recurringAudit = await rows(db, "select action from public.owner_finance_audit where entity_id = $1 order by created_at", [vercel]);
assert.deepEqual(recurringAudit.map((a) => a.action), ["recurring_create", "recurring_update"]);
const current = await due(owner);
assert.equal(current.timezone, "Asia/Bangkok");
assert.equal(current.today, today);

// ---------------------------------------------------------------- rollback and re-apply

const profilesBefore = (await one("select count(*)::int as n from public.profiles")).n;
const confirmationsBefore = (await one("select count(*)::int as n from public.membership_payment_confirmations")).n;
await db.exec(rollback);
for (const check of await checks()) assert.equal(check.ok, false, `after rollback: ${check.check_name}`);
for (const table of ["owner_manual_finance_entries", "owner_recurring_expenses", "owner_finance_audit"]) {
  assert.equal((await one(`select to_regclass('public.${table}') as t`)).t, null, `${table} dropped`);
}
assert.equal((await one("select count(*)::int as n from pg_policy where polname like 'owner_expense_receipts_%'")).n, 0, "storage policies dropped");
assert.equal((await one("select count(*)::int as n from storage.buckets where id = 'owner-expense-receipts'")).n, 1, "the bucket is left in place");
assert.equal((await one("select count(*)::int as n from public.profiles")).n, profilesBefore, "profiles untouched");
assert.equal((await one("select count(*)::int as n from public.membership_payment_confirmations")).n, confirmationsBefore, "membership payments untouched");
assert.equal((await one("select public.is_owner() as ok")).ok, false, "is_owner still exists");
await db.exec(m066);
for (const check of await checks()) assert.equal(check.ok, true, `after re-apply: ${check.check_name}`);

console.log("migration 066 owner finance: ok");
