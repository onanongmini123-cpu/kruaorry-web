// Replays the REAL migration chain (supabase/migrations/*.sql) in an in-process
// PGlite engine with a Supabase-like role / default-privilege setup, so a
// migration is tested against the schema it will meet, not a hand-built
// stand-in. Local only: it never talks to a remote database.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const ROLLBACKS = new URL("../../supabase/rollbacks/", import.meta.url);

export const migrationFiles = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();

/** File name of the migration numbered `number` (for example "053"). */
export function migrationName(number) {
  const name = migrationFiles.find((file) => file.includes(`_${number}_`));
  if (!name) throw new Error(`no migration numbered ${number}`);
  return name;
}

export const migrationSql = (number) => readFileSync(new URL(migrationName(number), MIGRATIONS), "utf8");

export function rollbackSql(number) {
  const name = migrationName(number).replace(/\.sql$/, ".rollback.sql");
  return readFileSync(new URL(name, ROLLBACKS), "utf8");
}

const BOOTSTRAP = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role authenticator noinherit login;
  grant anon, authenticated, service_role to authenticator;

  create schema auth;
  create schema storage;
  create schema extensions;

  -- Supabase default privileges for objects created by the migration role.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    is_anonymous boolean not null default false,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
  $$;
  grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;

  create table storage.buckets (
    id text primary key, name text not null, owner uuid,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    public boolean default false, avif_autodetection boolean default false,
    file_size_limit bigint, allowed_mime_types text[], owner_id text
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text, owner uuid, created_at timestamptz default now(),
    updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
    metadata jsonb, version text, owner_id text, user_metadata jsonb
  );
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  grant execute on all functions in schema storage to anon, authenticated, service_role;
`;

/** A database with Supabase's roles and `auth`/`storage` stand-ins, no migrations yet. */
export async function emptyDb(options = {}) {
  const db = new PGlite({ extensions: { pgcrypto }, ...options });
  if (!options.loadDataDir) await db.exec(BOOTSTRAP);
  return db;
}

/** The real chain up to and including migration `upTo` (for example "051"). */
export async function chainDb(upTo) {
  const db = await emptyDb();
  const last = migrationName(upTo);
  for (const file of migrationFiles) {
    if (file > last) break;
    try {
      await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
    } catch (error) {
      throw new Error(`migration ${file} failed: ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }
  return db;
}

/** Copy a database cheaply (a full data directory snapshot). */
export async function snapshotOf(db) {
  return db.dumpDataDir("none");
}

export const fromSnapshot = (snapshot) => emptyDb({ loadDataDir: snapshot });

export async function rows(db, sql, params = []) {
  return (await db.query(sql, params)).rows;
}

/** Run `fn` as a Supabase-like role carrying JWT claims (a signed-in member, anon, ...). */
export async function asRole(db, role, userId, fn, { anonymous = false } = {}) {
  const claims = JSON.stringify({ sub: userId ?? undefined, role, is_anonymous: anonymous });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
