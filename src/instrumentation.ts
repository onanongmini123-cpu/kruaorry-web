// Server/edge-side error/performance capture. Same DSN-gated no-op as
// src/instrumentation-client.ts until NEXT_PUBLIC_SENTRY_DSN is set.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
