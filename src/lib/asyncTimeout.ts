import { redactSensitive } from "./redact";

// Shared by every async stage on the download path (auth check, resource
// lookup, signed-URL creation) so each one is independently bounded and
// exception-safe — previously only the signed-URL call had a timeout, and
// nothing caught a thrown/rejected exception, so a stall or a thrown error
// in an earlier stage could hang a request indefinitely or fall through to
// a generic framework error page instead of a clear one.
export const ASYNC_STAGE_TIMEOUT_MS = 8000;

export type StageResult<T> = { ok: true; value: T } | { ok: false; reason: string; timedOut: boolean };

// Races `promise` against a fixed timeout and catches a thrown/rejected
// exception, so a caller can treat "it took too long" and "it threw" the
// same way — as a normal, bounded failure result — instead of hanging or
// letting an exception propagate uncaught. `reason` is always redacted
// (see redact.ts) since it may embed the underlying error's own message.
// `label` identifies the stage in logs; never pass anything sensitive (a
// URL, a token) as the label itself.
export async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number = ASYNC_STAGE_TIMEOUT_MS): Promise<StageResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<StageResult<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, reason: redactSensitive(`${label} timed out after ${timeoutMs}ms`), timedOut: true }), timeoutMs);
  });

  try {
    return await Promise.race([promise.then((value): StageResult<T> => ({ ok: true, value })), timeout]);
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return { ok: false, reason: redactSensitive(`${label} threw: ${message}`), timedOut: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
