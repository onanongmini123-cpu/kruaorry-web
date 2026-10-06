export const FOUNDER_CAPACITY_LIMIT = 100;

export interface FounderCapacity {
  used: number;
  capacity: number;
  remaining: number;
  isFull: boolean;
}

export function normalizeFounderCapacity(value: unknown): FounderCapacity | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;

  const candidate = row as Record<string, unknown>;
  const used = Number(candidate.used);
  const capacity = Number(candidate.capacity);
  const remaining = Number(candidate.remaining);
  const isFull = candidate.is_full;

  if (!Number.isInteger(used) || used < 0) return null;
  if (!Number.isInteger(capacity) || capacity <= 0) return null;
  if (!Number.isInteger(remaining) || remaining < 0) return null;
  if (typeof isFull !== "boolean") return null;

  return {
    used,
    capacity,
    remaining,
    isFull,
  };
}

/** Neutral public copy. The exact seat count stays in the back office. */
export const FOUNDER_LIMIT_NOTICE = `จำกัด ${FOUNDER_CAPACITY_LIMIT} บัญชีแรก`;
export const FOUNDER_FULL_NOTICE = "สิทธิ์ราคาเปิดตัวครบแล้ว";

/**
 * What visitors and members see about Founder availability: never the used
 * or remaining count, never a progress bar. A full offer is still stated
 * plainly because the price is no longer available.
 */
export function founderPublicNotice(capacity: Pick<FounderCapacity, "isFull">): string {
  return capacity.isFull ? FOUNDER_FULL_NOTICE : FOUNDER_LIMIT_NOTICE;
}
