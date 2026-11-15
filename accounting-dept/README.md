# Kru Aorry AI Accounting Department

Isolated from the KruAorry.com site: nothing in `src/`, `package.json`,
`vitest.config.mts` or any existing migration was changed. Nothing here is
deployed or applied to the live Supabase project.

## Pieces
- `supabase/migrations/…058…` – private `accounting` schema (14 tables, owner-only RLS,
  audit log, balanced-journal and immutability guards).
- `supabase/migrations/…059…` – approval / void functions, private evidence bucket,
  `accounting.dashboard_summary(from, to)` (approved, non-simulated data only).
- `line/parse.ts`, `line/webhook.ts` – LINE message parsing, signature check and
  owner-only pending-entry flow, with the DB injected through `AccountingStore`.

## Verify locally (no network, synthetic data)
```bash
node scripts/test-accounting-sql.mjs
npx vitest run --config accounting-dept/vitest.config.mts
```

## Not done yet (needs your decision before anything touches live systems)
1. Apply 058/059 to the live project (check the ledger first; `supabase/verification/059-verify.sql`).
2. `AccountingStore` adapter + HTTP endpoint for the LINE webhook: needs a separate
   LINE Official Account, its channel secret/token, the owner's LINE user id, and a
   server-side DB connection (the `accounting` schema is deliberately not exposed via the API).
3. Dashboard UI (the data function exists; a page would live in the site app).
4. Google Sheets import / bank-slip OCR / tax reports.
