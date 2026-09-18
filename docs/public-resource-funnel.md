# Public resource preview → signup → download

The `/resources` catalog and `/resources/[id]` detail pages show only published resources with a usable destination and cover image. They deliberately hide the placeholder destinations seeded by migration `002_seed_starter_content.sql`; no fake sample is shown when the catalog is empty or unavailable.

## Required project configuration

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the app host. Never use a service-role key in either variable.
- In Supabase Auth URL Configuration, set the production Site URL and explicitly allow the production and each preview origin's `/auth/callback` URL before testing confirmation emails. Do not rely on a broad redirect wildcard.
- Apply the existing resource-file Storage/RLS and membership migrations before publishing a downloadable file. The download API uses the signed-in visitor's own session, not an elevated key.
- Apply `20260918090000_022_resource_file_signup_gate.sql` before advertising a free download. It closes the old Storage-policy path that let signed-out clients create their own signed URL for a free file. First inspect the live `storage.objects` SELECT/ALL policies: another permissive policy could still grant access. Test direct anonymous Storage access is denied and a signed-in free account can download its free file.
- Apply the following `20260918090100_023_split_public_resource_read_policy.sql` in the same release. Its public catalogue exposes only display metadata; the actual external URL or private file path is resolved only after server-side membership checks. Do not deploy frontend code that reads `resource_catalog` before this migration is applied.

Read-only preflight in the Supabase SQL Editor:

```sql
select policyname, cmd, roles, permissive, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and cmd in ('SELECT', 'ALL')
order by policyname;

select id, public from storage.buckets where id = 'resource-files';
```

Before applying migrations 022–023, confirm `resource_files_entitled_read` is the active read rule for `resource-files` and the bucket remains private. Post-migration, test that an unauthenticated client cannot call Storage `createSignedUrl` for a free file or read a premium `cta_url` directly, a permanent free account can download its free file but cannot resolve a premium destination, and premium members/admins can open their entitled resources. Already-issued signed URLs cannot be revoked by this policy change; the app issues them for only 60 seconds. External Google/web destinations may still be reshared after an entitled member opens them; truly non-shareable access requires authorization at the destination service too.

## Publish the first genuine free sample

1. In the admin resource editor, create a resource with an original title, description, category, and real cover image. Do not use the starter rows' placeholder links.
2. For a downloadable sample, upload the actual PDF/DOCX/PPTX/XLSX/ZIP file to the private `resource-files` bucket through the editor and choose `file_download`. For a Google template or web tool, use its verified real HTTPS destination.
3. Mark it **free** (`is_free = true`) and **published**. Confirm that the public detail appears at `/resources/<id>` and that the homepage shows it under “ลองดูก่อนสมัคร”.
4. In a clean browser session, open the public detail, choose the signup CTA, confirm the email if required, and verify the browser returns to that exact file's download page or resource detail. Also verify a paid file remains denied to a free account.

The code path is ready without an initial sample file, but a real end-to-end download cannot be certified until a genuine resource has been published and a test account has completed the live email flow.

## Local checks

Run `npm test`, `npm run test:resource-file-sql`, `npm run test:public-resource-sql`, `npm run lint`, and `npx tsc --noEmit`. The SQL tests use an isolated PGlite database and never contact Supabase; they do not replace testing against the live project's policy set. Run `npm run build` in an environment that can reach Google Fonts. When Turbopack cannot spawn a local worker in a restricted sandbox, `npm run build -- --webpack` verifies the same production routes with Next.js's documented Webpack mode.
