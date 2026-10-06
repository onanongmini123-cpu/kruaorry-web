/**
 * Resource slugs: lowercase ASCII words joined by single hyphens, 3 to 80
 * characters, never shaped like a UUID (so /resources/{uuid} and
 * /resources/{slug} can never be confused).
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 80;

export function isResourceUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= SLUG_MIN_LENGTH
    && value.length <= SLUG_MAX_LENGTH
    && SLUG_PATTERN.test(value)
    && !UUID_PATTERN.test(value);
}

/**
 * Turns a title into a slug candidate using only its Latin letters and digits.
 * Thai-only titles yield "" on purpose (there is no reliable Thai-to-Latin
 * transliteration): staff supply a readable English slug for those.
 */
export function slugify(input: string | null | undefined): string {
  const slug = (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return isValidSlug(slug) ? slug : "";
}

/**
 * Deterministic collision handling: the first free of base, base-2, base-3 …
 * (the base is shortened so the suffix always fits). Callers pass the set of
 * slugs already taken, in a stable order, so reruns give the same result.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!isValidSlug(base)) return "";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (isValidSlug(candidate) && !taken.has(candidate)) return candidate;
  }
  return "";
}
