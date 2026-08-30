// Client-side error/performance capture. Inert until NEXT_PUBLIC_SENTRY_DSN
// is set (Sentry.init with an empty dsn just doesn't send anything) — so
// this ships safely and only starts reporting once a Sentry project is
// created and its DSN is added to the deployment's env vars.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
