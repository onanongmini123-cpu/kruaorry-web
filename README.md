This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Operations

### Health check

`GET /api/health` is a public, unauthenticated endpoint for uptime monitors. It returns
`200 {"status":"ok","db":"ok"}` when the app can reach Supabase, and `503 {"status":"error","db":"down"}`
otherwise — so a monitor can tell "site down" apart from "site up, database down".

To get downtime alerts: create a free account with an uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com)),
add an HTTP(S) monitor pointed at `https://<your-domain>/api/health`, and set up its alert contact
(email/SMS/etc.) — this has to be done in that service's own dashboard, no code change needed.

### Error monitoring (Sentry)

Client, server, and edge error capture is already wired up (`src/instrumentation.ts`,
`src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`,
and `Sentry.captureException` in `error.tsx`/`global-error.tsx`), but it's inert until a DSN is
configured — nothing is sent anywhere by default.

To turn it on:
1. Create a free account at [sentry.io](https://sentry.io) and a new Next.js project.
2. Copy its DSN and set `NEXT_PUBLIC_SENTRY_DSN` in the deployment's env vars (Vercel project settings).
3. Optional, for readable stack traces (source map upload on build): also set `SENTRY_ORG`, `SENTRY_PROJECT`,
   and `SENTRY_AUTH_TOKEN` (create the token under Sentry → Settings → Auth Tokens, `project:releases` scope).
4. Sentry's default alert rule emails the project's members on new issues — adjust under
   Sentry → Alerts if a different channel is wanted.

See `.env.example` for the full list of variables.

### Database backup & recovery

The Supabase project is on the free tier, which has **no automatic backups or point-in-time recovery**.
`.github/workflows/db-backup.yml` runs a `pg_dump` daily (02:00 ICT) and on demand (Actions tab → "Database
backup" → "Run workflow"), and uploads it as a GitHub Actions artifact (30-day retention).

This repository is public, and public-repo Actions artifacts are downloadable by any GitHub account with
read access — so the dump (which contains member emails/names) is symmetric-encrypted with GPG before
upload. **Two repository secrets must be set** (Settings → Secrets and variables → Actions) before this
workflow can run successfully:

- `SUPABASE_DB_URL` — the direct Postgres connection string, from the Supabase dashboard:
  Project Settings → Database → Connection string ("URI", not the pooler/transaction-mode one).
- `BACKUP_ENCRYPTION_PASSPHRASE` — any strong passphrase you generate and store somewhere safe
  (a password manager). **If it's lost, existing backups can't be decrypted — there is no recovery.**

To restore a backup: download the artifact from the workflow run, then run
`./scripts/restore-db-backup.sh backup.dump.gpg "<target-postgres-connection-string>"`. Restore into a
fresh database (local Postgres, a Supabase branch, or a new project) and verify the data first — restoring
straight into production should be a deliberate, separate decision, not the default.
