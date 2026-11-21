// "I sent the slip" is remembered in this browser only, per reference code, so
// reopening /membership lands on the waiting step. It is a convenience and
// never an approval signal: nothing is written to the database, and without
// storage (private window, blocked site data) the page simply opens on step 2.

const PREFIX = "kru:membership:slip-sent:";
const REFERENCE = /^[A-Za-z0-9-]{3,40}$/;

export type SlipStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SlipStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSlipSent(referenceCode: string, storage: SlipStorage | null = browserStorage()): boolean {
  if (!storage || !REFERENCE.test(referenceCode)) return false;
  try {
    return storage.getItem(PREFIX + referenceCode) === "1";
  } catch {
    return false;
  }
}

export function writeSlipSent(referenceCode: string, sent: boolean, storage: SlipStorage | null = browserStorage()): void {
  if (!storage || !REFERENCE.test(referenceCode)) return;
  try {
    if (sent) storage.setItem(PREFIX + referenceCode, "1");
    else storage.removeItem(PREFIX + referenceCode);
  } catch {
    // Storage is full or blocked: the step still works for this visit.
  }
}
