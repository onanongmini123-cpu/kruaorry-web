# Signup email confirmation

## Production configuration observed on 2026-10-02

The following was checked read-only. No Supabase, Resend, or production setting
was changed.

- Supabase Site URL is `https://kruaorry-web.vercel.app`.
- The production app origin is allowlisted as
  `https://kruaorry-web.vercel.app/**`. This includes the app's fixed
  `/auth/callback` endpoint, so the production redirect target matches the
  code. Preview origins are not allowlisted and cannot complete preview email
  confirmation until their exact callback URL is explicitly added.
- Custom SMTP is enabled through `smtp.resend.com` on port 465 with a 60-second
  minimum send interval. The sender address, username, and credential were not
  exposed or changed during the audit.
- Supabase Auth Logs returned no entries. The available evidence therefore
  cannot establish whether a missing message was caused by the Resend sender or
  domain state, SMTP credentials, provider delivery, or a prior rate limit.

The broad production-origin redirect entry can be narrowed to the exact
`https://kruaorry-web.vercel.app/auth/callback` as a separate configuration
hardening task. The application still validates every post-auth destination
against its internal route allowlist and never accepts an arbitrary URL.

## Application recovery behavior

- Supabase/SMTP error text is never shown to the visitor. Sign-up, sign-in,
  resend, and password-reset failures use generic Thai copy.
- A sign-up response without a session opens the confirmation help UI and
  starts a 60-second resend cooldown.
- A failed sign-up also offers resend because an upstream mail failure may
  leave an unconfirmed account. The response remains conditional so it does
  not disclose whether an address has an account.
- `email_not_confirmed` sign-in errors open the same recovery UI.
- Resend uses Supabase Auth's `resend({ type: "signup" })`, preserves the safe
  internal return path, applies the 60-second local guard before the request,
  and gives the approved LINE OA as the support fallback.

## Safe verification

Automated coverage injects a mocked resend function and never contacts
Supabase or sends an email:

```bash
npx vitest run src/lib/__tests__/signupEmailConfirmation.test.ts \
  src/lib/__tests__/authReturnPath.test.ts \
  src/lib/__tests__/signupConfirmation.test.ts
```

A real delivery check remains an explicit production QA action. Before doing
one, verify the Resend sender/domain and SMTP credential state, choose an
authorized test recipient, and observe both Supabase Auth and Resend delivery
logs. For a preview deployment, allowlist that preview's exact
`/auth/callback` URL first; do not add a cross-origin wildcard.
