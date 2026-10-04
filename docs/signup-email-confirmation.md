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
- A failed or disconnected sign-up also moves to the same sign-in/recovery
  surface because an upstream mail failure may leave an unconfirmed account.
  The password is cleared, the resend CTA is guarded for 60 seconds, and the
  message is identical for an existing address, an SMTP failure, a rate limit,
  an unknown Auth failure, and an indeterminate network response. It therefore
  does not disclose whether an address has an account, whether delivery was
  attempted, or which upstream outcome occurred.
- Only Supabase Auth codes declared by the installed SDK and known to reject
  before account creation stay on the sign-up form: weak password, invalid
  email/validation, CAPTCHA failure, disabled sign-up, and disabled email
  provider. Each maps to fixed Thai corrective copy; provider messages are
  never parsed. Unknown and newly introduced server codes fail into recovery.
- A rate-limited resend has the same visible accepted message as any other
  resend while the local controller still blocks every provider call for the
  full 60 seconds.
- `email_not_confirmed` sign-in errors open the same recovery UI.
- Resend uses Supabase Auth's `resend({ type: "signup" })`, preserves the safe
  internal return path, applies the 60-second local guard before the request,
  and gives the approved LINE OA as the support fallback.
- A password-recovery link is consumed only after the visitor explicitly
  selects **ยืนยันลิงก์**. The page handles returned failures and rejected
  promises from token verification, PKCE exchange, session lookup, and password
  update with fixed Thai copy; it never renders the provider message.
- Failed recovery verification always leaves the checking state. A failed or
  successful password update always leaves the loading state and clears both
  password fields, so password values are not retained after the request.

## Diagnostic boundary: application code vs hosted delivery

The browser cannot determine from `Error sending confirmation email` whether
Supabase created the unconfirmed user before SMTP delivery failed. It must not
parse or display that English provider message. The application therefore
treats the result as indeterminate and offers the privacy-safe recovery flow.

Evidence that can be established from this repository without accessing an
external account:

- local password confirmation and email-format validation run before Auth;
- the callback is same-origin and its final destination is allowlisted;
- failure to construct that local callback stops before Auth and uses fixed Thai
  corrective copy; it never claims that the registration request was received;
- provider messages, recipient addresses, passwords, and SMTP details are not
  rendered or logged by the sign-up flow;
- unknown/account/delivery/rate-limit failures and disconnected responses clear
  both password fields, enter the same generic recovery UI, and synchronously
  start the 60-second resend guard, while the conservative stable-code allowlist
  remains on sign-up with corrective Thai copy; and
- resend calls use only the injected Supabase Auth boundary, which is mocked in
  automated tests.

Evidence that **cannot** be established from the repository or browser error
alone includes SMTP credential validity, Resend domain verification, quota,
provider acceptance, suppression/bounce state, and final inbox delivery. Those
require correlated Supabase Auth and Resend records. Do not label one of these
as a code defect, or change production configuration, without that evidence.

## Read-only Supabase Auth and Resend checklist

Dashboard access is a separate external-account action. Obtain explicit user
approval immediately before opening Supabase or Resend, keep the inspection
read-only, and do not reveal, copy, rotate, or save any secret or recipient
address. Correlate records by a narrow timestamp window or non-sensitive
request identifier rather than by pasting an email into notes or logs.

1. **Supabase Auth Logs** — inspect the sign-up/resend event and record only its
   timestamp, safe error code, HTTP status, and request ID. Do not copy a raw
   message if it contains an address, SMTP host, credential, or token.
2. **Email Confirmation** — confirm that email confirmation is enabled and that
   the email provider is not disabled. Do not change either setting during the
   audit.
3. **SMTP sender** — verify that the configured From address/name belongs to the
   intended domain and matches the sender authorized in Resend. Never reveal
   the SMTP username or password.
4. **Verified domain** — confirm the Resend domain status is verified and review
   the SPF/DKIM status shown by the provider; DNS changes require a separate
   change approval.
5. **Credential status** — verify that the referenced SMTP/API credential is
   active and not revoked or expired. Do not display, copy, test, or rotate the
   credential as part of read-only review.
6. **Quota and rate limits** — check Supabase Auth email limits and Resend quota,
   rate-limit, suppression, bounce, and complaint indicators for the same time
   window.
7. **Delivery logs** — correlate the Supabase request with Resend accepted,
   delivered, deferred, bounced, or rejected status. Keep recipient data out of
   screenshots and reports.
8. **Template callback** — verify the confirmation template uses Supabase's
   generated confirmation URL and resolves to the exact allowlisted
   `/auth/callback` origin before preserving a safe internal `next` path.
9. **Link tracking** — verify click/link rewriting does not replace, truncate,
   prefetch, or prematurely consume the one-time confirmation link. Any change
   to tracking is a production configuration change and needs separate approval.

## Safe verification

Automated coverage injects a mocked resend function and never contacts
Supabase or sends an email:

```bash
npx vitest run src/lib/__tests__/signupEmailConfirmation.test.ts \
  src/lib/__tests__/authReturnPath.test.ts \
  src/lib/__tests__/signupConfirmation.test.ts \
  src/app/reset-password/resetPassword.test.ts
```

### One-account real-delivery test plan — waiting for approval

Do not execute this plan, create the account, or send an email until the user
explicitly approves the individual live test and supplies/authorizes the test
inbox through a private input surface.

1. Confirm the production callback and sender/domain checks above without
   changing configuration.
2. Open a clean private browser session and register one dedicated test account
   through the public form. Do not put its email or password in a URL, terminal,
   source file, screenshot, console, ticket, or chat transcript.
3. Record only the test start time and a non-sensitive correlation/request ID.
   Confirm the UI shows generic Thai copy and immediately starts at 60 seconds.
4. Confirm one matching Supabase Auth event and one matching Resend delivery
   event, then verify the message arrives in the authorized inbox.
5. Open the message once and confirm it returns through the exact production
   `/auth/callback` to the allowlisted internal destination. Verify the session
   is established without exposing tokens in the address bar or logs.
6. In another clean session, exercise one resend only after the cooldown ends;
   verify the same generic UI whether the address is pending, confirmed, or
   unknown. Do not infer or report account existence from the response.
7. Stop after the single-account verification. Account cleanup or any SMTP,
   template, DNS, quota, tracking, or redirect change requires separate explicit
   approval.

For a preview deployment, allowlist that preview's exact `/auth/callback` URL
first; do not add a cross-origin wildcard. This is also a configuration change
and must not be performed as part of the read-only audit.
