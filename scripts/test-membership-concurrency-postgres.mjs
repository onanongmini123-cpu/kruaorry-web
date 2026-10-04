import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const image = "public.ecr.aws/supabase/postgres:17.6.1.167";
const container = `kruaorry-membership-concurrency-${process.pid}-${randomUUID().slice(0, 8)}`;
const database = "kruaorry_test";
const password = "kruaorry-isolated-test-only";
const adminId = randomUUID();
const migrationFiles = [
  "20260901090000_017b_membership_catalog_and_capabilities.sql",
  "20260901090100_018_subscriptions_and_legacy_backfill.sql",
  "20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql",
  "20260901090300_020_membership_safety_guards.sql",
  "20260901090400_021_founder_seat_usage.sql",
  "20260924170000_025_active_founder_capacity.sql",
  "20261001190000_048_founder_payment_confirmation.sql",
  "20261003120000_049_founder_first_year_once.sql",
  "20261004100000_050_admin_line_slip_workflow.sql",
];

function findDocker() {
  const candidates = [
    process.env.DOCKER_BIN,
    "docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    `${process.env.HOME ?? ""}/.docker/bin/docker`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["version", "--format", "{{.Server.Version}}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status === 0 && result.stdout.trim()) return candidate;
  }
  throw new Error("Docker Desktop is required for the isolated PostgreSQL concurrency test");
}

const docker = findDocker();

function dockerSync(args, options = {}) {
  const result = spawnSync(docker, args, {
    encoding: "utf8",
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    input: options.input,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function psql(sql, { allowFailure = false } = {}) {
  const result = dockerSync([
    "exec", "-i", container,
    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", database,
  ], { input: sql, allowFailure });
  return result;
}

function psqlConcurrent(sql) {
  return new Promise((resolve) => {
    const child = spawn(docker, [
      "exec", "-i", container,
      "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "supabase_admin", "-d", database,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

const baselineSql = String.raw`
  create extension if not exists pgcrypto;
  create schema if not exists auth;
  create schema if not exists storage;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  create table public.profiles (
    id uuid primary key,
    plan text not null default 'free',
    role text not null default 'member',
    created_at timestamptz not null default now()
  );
  create table public.plans (
    id text primary key,
    name text not null,
    price_label text not null,
    note text,
    features text[] not null default '{}',
    sort_order integer not null default 0
  );
  insert into public.plans(id, name, price_label, note, features, sort_order)
  values
    ('free', 'Free', '0', null, '{}', 1),
    ('plus', 'Plus', '990 บาท/ปี', 'legacy', '{}', 2);
  create table public.resources (
    id uuid primary key,
    status text not null default 'published',
    is_free boolean not null default false,
    file_path text
  );
  create table public.saved_resources (
    user_id uuid not null references public.profiles(id) on delete cascade,
    resource_id uuid not null,
    primary key (user_id, resource_id)
  );
  create table public.upgrade_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id text not null references public.plans(id),
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    resolved_at timestamptz
  );
  alter table public.upgrade_requests enable row level security;
  create policy "upgrade_requests_insert_own" on public.upgrade_requests
    for insert with check (auth.uid() = user_id);
  create policy "upgrade_requests_admin_update" on public.upgrade_requests
    for update using (true) with check (true);
  create or replace function public.is_admin() returns boolean language sql stable security definer
    set search_path = public as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('admin', 'owner')
      );
    $$;
  create table storage.objects (name text, bucket_id text);
  alter table storage.objects enable row level security;
  create policy resource_files_entitled_read on storage.objects
    for select using (bucket_id = 'resource-files');
`;

const setupCasesSql = String.raw`
  create table public.test_concurrency_cases (
    seq integer primary key,
    user_id uuid not null unique,
    request_id uuid not null unique,
    idempotency_key uuid not null unique,
    paid_at timestamptz not null
  );
  insert into public.profiles(id, role) values ('${adminId}', 'owner');
  do $$
  declare
    i integer;
    v_user_id uuid;
    v_request_id uuid;
    v_paid_at timestamptz;
  begin
    for i in 1..101 loop
      v_user_id := gen_random_uuid();
      v_paid_at := timestamptz '2026-10-04 00:00:00+00' + (i || ' seconds')::interval;
      insert into public.profiles(id) values (v_user_id);
      perform set_config('request.jwt.claim.sub', v_user_id::text, false);
      select application.id into v_request_id
      from public.create_membership_application('founder') application;
      perform set_config('request.jwt.claim.sub', '${adminId}', false);
      perform public.record_membership_line_slip_received(v_request_id);
      insert into public.test_concurrency_cases(seq, user_id, request_id, idempotency_key, paid_at)
      values (i, v_user_id, v_request_id, gen_random_uuid(), v_paid_at);
    end loop;
  end;
  $$;
`;

function confirmationSql(sequence) {
  return String.raw`
    select set_config('request.jwt.claim.sub', '${adminId}', false);
    select public.confirm_membership_payment(
      test_case.request_id,
      299,
      'founder-concurrency-' || test_case.seq,
      test_case.paid_at,
      test_case.idempotency_key
    )
    from public.test_concurrency_cases test_case
    where test_case.seq = ${sequence};
  `;
}

let started = false;
try {
  dockerSync([
    "run", "--rm", "-d", "--pull=never",
    "--name", container,
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", `POSTGRES_DB=${database}`,
    image,
  ]);
  started = true;

  let ready = false;
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = dockerSync(
      ["exec", container, "pg_isready", "-U", "supabase_admin", "-d", database],
      { allowFailure: true },
    );
    if (status.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 5) {
        ready = true;
        break;
      }
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, "isolated PostgreSQL did not become ready");

  psql(baselineSql);
  for (const file of migrationFiles) {
    const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    psql(`begin;\n${sql}\ncommit;`);
    process.stdout.write(`executed ${file}\n`);
  }

  psql(setupCasesSql);

  // Force a failure after activation/slot allocation has started. PostgreSQL
  // must roll back the request, subscription, ledger and audit as one unit.
  psql(String.raw`
    create function public.reject_test_payment_audit() returns trigger
    language plpgsql as $$ begin raise exception 'test-only payment audit failure'; end; $$;
    create trigger trg_reject_test_payment_audit
      before insert on public.membership_payment_confirmations
      for each row execute function public.reject_test_payment_audit();
  `);
  const rollbackFailure = psql(confirmationSql(1), { allowFailure: true });
  assert.notEqual(rollbackFailure.status, 0, "forced mid-confirmation failure unexpectedly succeeded");
  assert.match(rollbackFailure.stderr, /test-only payment audit failure/);
  psql(String.raw`
    drop trigger trg_reject_test_payment_audit on public.membership_payment_confirmations;
    drop function public.reject_test_payment_audit();
    do $$
    begin
      if (select count(*) from public.founder_seat_ledger) <> 0
        or (select count(*) from public.subscriptions where plan_id = 'founder') <> 0
        or (select count(*) from public.membership_payment_confirmations) <> 0
        or (select status from public.upgrade_requests where id = (
          select request_id from public.test_concurrency_cases where seq = 1
        )) <> 'pending'
      then
        raise exception 'forced failure left partial Founder state';
      end if;
    end;
    $$;
  `);

  // Confirm one Founder while capacity remains, then prove the permanent
  // ledger blocks the same account from claiming the first-year offer again.
  psql(confirmationSql(1));
  const repeatFounder = psql(String.raw`
    select set_config(
      'request.jwt.claim.sub',
      (select user_id::text from public.test_concurrency_cases where seq = 1),
      false
    );
    select * from public.create_membership_application('founder');
  `, { allowFailure: true });
  assert.notEqual(repeatFounder.status, 0, "repeat Founder application unexpectedly succeeded");
  assert.match(repeatFounder.stderr, /Founder first-year offer cannot be claimed twice/);

  // Fill the remaining slots through 99 transactionally before racing the
  // last two applications.
  psql(String.raw`
    select set_config('request.jwt.claim.sub', '${adminId}', false);
    do $$
    declare test_case public.test_concurrency_cases%rowtype;
    begin
      for test_case in
        select * from public.test_concurrency_cases where seq between 2 and 99 order by seq
      loop
        perform public.confirm_membership_payment(
          test_case.request_id, 299,
          'founder-concurrency-' || test_case.seq,
          test_case.paid_at, test_case.idempotency_key
        );
      end loop;
    end;
    $$;
  `);
  assert.equal(psql("select used from public.get_founder_capacity();").stdout.trim(), "99");

  const race = await Promise.all([
    psqlConcurrent(confirmationSql(100)),
    psqlConcurrent(confirmationSql(101)),
  ]);
  const winners = race.filter((result) => result.code === 0);
  const losers = race.filter((result) => result.code !== 0);
  assert.equal(winners.length, 1, `expected one concurrent winner, got ${JSON.stringify(race)}`);
  assert.equal(losers.length, 1, `expected one concurrent rejection, got ${JSON.stringify(race)}`);
  assert.match(losers[0].stderr, /Founder 100 is full/);

  const winner = Number(psql(String.raw`
    select test_case.seq
    from public.test_concurrency_cases test_case
    join public.upgrade_requests request on request.id = test_case.request_id
    where test_case.seq in (100, 101) and request.status = 'approved';
  `).stdout.trim());
  assert.ok(winner === 100 || winner === 101, "could not identify the 100th Founder winner");
  const loser = winner === 100 ? 101 : 100;

  psql(String.raw`
    do $$
    begin
      if (select count(*) from public.founder_seat_ledger) <> 100
        or (select count(*) from public.founder_seat_ledger where slot_number between 1 and 100) <> 100
        or (select count(distinct slot_number) from public.founder_seat_ledger) <> 100
        or (select count(*) from public.upgrade_requests where status = 'approved' and plan_id = 'founder') <> 100
        or (select count(*) from public.upgrade_requests where status = 'pending' and id = (
          select request_id from public.test_concurrency_cases where seq = ${loser}
        )) <> 1
      then
        raise exception 'concurrent Founder cap invariant failed';
      end if;
    end;
    $$;
  `);

  // An exact retry returns the original result without consuming another slot.
  psql(confirmationSql(winner));
  assert.equal(psql("select used from public.get_founder_capacity();").stdout.trim(), "100");

  process.stdout.write(
    `real PostgreSQL concurrency passed: slots 1-99 seeded, slot 100 won by case ${winner}, case ${loser} was rejected, exact retry remained idempotent\n`,
  );
} finally {
  if (started) dockerSync(["stop", container], { allowFailure: true });
}
