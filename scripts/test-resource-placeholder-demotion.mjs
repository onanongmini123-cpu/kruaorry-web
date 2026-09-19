import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Offline data-migration regression for migration 024. No live Supabase connection.
const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260919090000_024_demote_placeholder_seed_resources.sql", import.meta.url),
  "utf8",
);

const publishedAt = "2026-08-27T00:00:00.000Z";

async function rows() {
  const result = await db.query(`
    select title, status, cta_url, published_at is null as published_at_cleared
    from public.resources
    order by title, cta_url
  `);
  return result.rows;
}

try {
  await db.exec(`
    create table public.resources (
      id uuid primary key,
      title text not null,
      delivery_mode text not null,
      cta_url text,
      status text not null,
      published_at timestamptz,
      created_by uuid
    );

    insert into public.resources
      (id, title, delivery_mode, cta_url, status, published_at, created_by)
    values
      ('00000000-0000-4000-8000-000000000001', 'ใบงานคณิตศาสตร์ ป.4 พร้อมสอน', 'google_template', 'https://docs.google.com/document/d/placeholder/copy', 'published', '${publishedAt}', null),
      ('00000000-0000-4000-8000-000000000002', 'ตัวจับเวลากิจกรรมในห้องเรียน', 'web_app', 'https://example.com/classroom-timer', 'published', '${publishedAt}', null),
      ('00000000-0000-4000-8000-000000000003', 'แบบประเมินความพึงพอใจผู้ปกครอง', 'google_form', 'https://forms.gle/placeholder', 'published', '${publishedAt}', null),
      ('00000000-0000-4000-8000-000000000004', 'ใบงานคณิตศาสตร์ ป.4 พร้อมสอน', 'google_template', 'https://docs.google.com/document/d/real-template/copy', 'published', '${publishedAt}', null),
      ('00000000-0000-4000-8000-000000000005', 'สื่อจริง', 'web_app', '/tools/timer', 'published', '${publishedAt}', null),
      ('00000000-0000-4000-8000-000000000006', 'ตัวจับเวลากิจกรรมในห้องเรียน', 'web_app', 'https://example.com/classroom-timer', 'published', '${publishedAt}', '11111111-1111-4111-8111-111111111111'),
      ('00000000-0000-4000-8000-000000000007', 'แบบประเมินความพึงพอใจผู้ปกครอง', 'google_form', 'https://forms.gle/placeholder', 'archived', '${publishedAt}', null),
      ('f9438548-f8b2-4496-a18a-0acd6e69d879', 'สื่อทดสอบระบบ (มีรูปปก) 28 ส.ค. 2569', 'web_app', 'https://kruaorry-web.vercel.app/', 'published', '${publishedAt}', '22222222-2222-4222-8222-222222222222');
  `);

  await db.exec(migration);

  const firstRun = await rows();
  const demoted = firstRun.filter((row) => row.status === "draft");
  assert.deepEqual(
    demoted.map((row) => row.title),
    [
      "ตัวจับเวลากิจกรรมในห้องเรียน",
      "สื่อทดสอบระบบ (มีรูปปก) 28 ส.ค. 2569",
      "แบบประเมินความพึงพอใจผู้ปกครอง",
      "ใบงานคณิตศาสตร์ ป.4 พร้อมสอน",
    ],
  );
  assert.ok(demoted.every((row) => row.published_at_cleared), "demoted seeds must lose their publication timestamp");
  assert.ok(
    demoted.every(
      (row) =>
        row.cta_url.includes("placeholder") ||
        row.cta_url.includes("example.com") ||
        row.cta_url === "https://kruaorry-web.vercel.app/",
    ),
    "the admin must retain each old placeholder or smoke-test target so it can be diagnosed and replaced",
  );

  const validSeedCorrection = firstRun.find((row) => row.cta_url.includes("real-template"));
  assert.equal(validSeedCorrection.status, "published", "a corrected seed target must stay published");
  assert.equal(validSeedCorrection.published_at_cleared, false);

  const validResource = firstRun.find((row) => row.title === "สื่อจริง");
  assert.equal(validResource.status, "published", "valid content must stay published");
  assert.equal(validResource.published_at_cleared, false);

  const createdByAdmin = firstRun.find(
    (row) => row.title === "ตัวจับเวลากิจกรรมในห้องเรียน" && row.status === "published",
  );
  assert.ok(createdByAdmin, "an admin-created lookalike must be left untouched");
  assert.equal(createdByAdmin.published_at_cleared, false);

  const archived = firstRun.find((row) => row.status === "archived");
  assert.ok(archived, "an already-unpublished seed must preserve its state");
  assert.equal(archived.published_at_cleared, false);

  await db.exec(migration);
  assert.deepEqual(await rows(), firstRun, "the migration must be idempotent");

  process.stdout.write("Migration 024 placeholder seed demotion passed in isolated PGlite.\n");
} finally {
  await db.close();
}
