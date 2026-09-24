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
