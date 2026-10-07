# Analytics

Product code reports events through one function, `trackEvent(name, properties)`
in `src/lib/analytics.ts`. It knows no vendor. A tool is connected in one place
and nothing else changes.

## What is reported

An event is reported only where the thing provably happened (a click, a page
view, a successful call).

| Event | When | Properties |
| --- | --- | --- |
| `home_view` | The landing page is shown | none |
| `search` | A search on the landing page, or a library page with a search or filters | `source`, `query_length`, `results_count`, `filters_count` |
| `resource_view` | A resource detail page is shown | `resource_id`, `slug`, `access_tier`, `delivery_mode`, `authenticated` |
| `resource_start` | The main button is pressed by a viewer who can use the resource | `resource_id`, `slug`, `access_tier`, `delivery_mode`, `source` |
| `outbound_game_open` | The same press when the resource is a web game or tool that opens another site | `resource_id`, `source` |
| `download` | A file download finished in the browser | `resource_id`, `stage: completed` |
| `signup_start` | The sign-up form is shown, or a sign-up button is pressed by a visitor | `source` |
| `signup_complete` | The sign-up request succeeded (`mode`: `email_confirmation` or `session`) | `mode` |
| `pricing_view` | The pricing section is mostly on screen | `source` |
| `upgrade_click` | Any Teacher Pro / Founder button | `source`, `plan_id`, `resource_id` |
| `checkout_start` | A membership application is created | `plan_id`, `source` |
| `payment_submit` | LINE is opened with the application reference (`stage: line_opened`) | `plan_id`, `stage` |
| `pro_activated` | An admin confirmed a payment and the plan was activated or renewed | `plan_id`, `stage` |
| `favorite_add` | A resource was saved to favourites successfully | `resource_id`, `source` |

## What is deliberately not reported

- **`game_start` and `game_complete`.** External games do not call back into
  this site, so the site cannot know that a game was started or finished.
  `resource_start` and `outbound_game_open` say that someone opened it. If a
  game should report completion, define an explicit contract first (for
  example the game sends `postMessage({ type: "kruaorry:complete", resourceId })`
  to the opener, and the site verifies the origin) and add the event then.
- `payment_submit` is the step the site can see: opening LINE with the
  reference. Whether the slip was sent is only known to staff.

## Privacy rules (enforced in code)

Only the property names in `ALLOWED_PROPERTIES` are sent. Strings are cut to 80
characters, and anything that looks like an email address or a phone number is
dropped. No user id, name, email, IP address or user-agent string is ever part
of an event. The words typed into search are never sent (people type names and
schools there); only the length of the search and how many results it had are.

## Connecting a tool

`trackEvent` already feeds a page's Google Tag Manager `dataLayer` and Plausible
(`window.plausible`) when their script is on the page. Nothing is sent when no
tool is present. To use something else, register a provider once at startup:

```ts
import { registerAnalyticsProvider } from "@/lib/analytics";

registerAnalyticsProvider({
  name: "my-tool",
  track({ name, properties }) {
    myTool.capture(name, properties);
  },
});
```

For Vercel Web Analytics add `@vercel/analytics`, render its `<Analytics />`
component in `app/layout.tsx`, and register a provider that calls its `track`
(custom events need a paid plan on Vercel).
