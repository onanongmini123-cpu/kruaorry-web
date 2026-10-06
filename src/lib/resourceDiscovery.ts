import { ACCESS_TIER_LABEL, accessTier } from "@/lib/resourceAccess";
import type { ResourceAccessMode } from "@/lib/entitlement";
import { isResourceGrade, resourceGradeSearchTerms } from "@/lib/resourceGrades";
import { DELIVERY_TYPE_LABEL, isResourceTypeFilter, resourceTypeOf, type ResourceTypeFilter } from "@/lib/resourceMeta";
import type { DeliveryMode } from "@/lib/resourceFile";

/**
 * Access filter values, one per customer-facing tier:
 * free = ใช้ฟรี (no sign-up), member = สมาชิกฟรี, pro = Teacher Pro.
 */
export type ResourceAccessFilter = "all" | "free" | "member" | "pro";

export const ACCESS_FILTER_OPTIONS: ReadonlyArray<{ value: ResourceAccessFilter; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "free", label: ACCESS_TIER_LABEL.free },
  { value: "member", label: ACCESS_TIER_LABEL.member },
  { value: "pro", label: ACCESS_TIER_LABEL.pro },
];

export interface ResourceDiscoveryFilters {
  query?: string;
  category?: string;
  grade?: string;
  access?: ResourceAccessFilter;
  type?: ResourceTypeFilter;
}

export interface DiscoverableResource {
  title: string;
  meta?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: readonly string[] | null;
  gradeLevels?: readonly string[] | null;
  isFree: boolean;
  accessMode?: ResourceAccessMode;
  /** Either name is accepted: public pages say deliveryMode, the member app says affordance. */
  deliveryMode?: DeliveryMode | null;
  affordance?: DeliveryMode | null;
}

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000e-\u001f\u007f]/g;
const LINE_WHITESPACE = /[\t\n\v\f\r]/g;
// Zero-width characters sneak in when Thai text is copied from documents/chat.
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

function cleaned(value: string | null | undefined): string {
  return (value ?? "").replace(LINE_WHITESPACE, " ").replace(CONTROL_CHARACTERS, "").replace(INVISIBLE, "").trim();
}

function bounded(value: string | null | undefined, maxLength = 100): string {
  return cleaned(value).slice(0, maxLength);
}

/** Thai digits (๐–๙) to ASCII, so "ป.๓" and "ประถม ๓" find "ป.3". */
function asciiDigits(value: string): string {
  return value.replace(/[\u0e50-\u0e59]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50));
}

/**
 * Writes any mention of a school year the same way: "ป.3", "ม.1".
 *
 * The short Thai forms (ป/ม) only count when they are not the tail of another
 * Thai word, so "ทีม 3 คน" is never read as "ม.3". English "p3", "grade 3" and
 * "prathom 3" are treated as the same Thai school year.
 */
function canonicalGrades(value: string): string {
  return value
    .replace(/ชั้น\s*(?=ประถม|มัธยม|[ปม]\s?\.?\s?[1-6])/g, "")
    .replace(/ประถม(?:ศึกษา)?(?:\s*ปี(?:ที่)?)?\s*([1-6])(?!\d)/g, "ป.$1")
    .replace(/มัธยม(?:ศึกษา)?(?:\s*ปี(?:ที่)?)?\s*([1-6])(?!\d)/g, "ม.$1")
    .replace(/(?<![a-z])prathom\s*([1-6])(?!\d)/g, "ป.$1")
    .replace(/(?<![a-z])mat+h?ayom\s*([1-6])(?!\d)/g, "ม.$1")
    .replace(/(?<![a-z])grade\s*(\d{1,2})(?!\d)/g, (match, digits: string) => {
      const year = Number(digits);
      if (year >= 1 && year <= 6) return `ป.${year}`;
      if (year >= 7 && year <= 12) return `ม.${year - 6}`;
      return match;
    })
    .replace(/(?<![\u0e00-\u0e7f])ป\s?\.?\s?([1-6])(?!\d)/g, "ป.$1")
    .replace(/(?<![\u0e00-\u0e7f])ม\s?\.?\s?([1-6])(?!\d)/g, "ม.$1")
    .replace(/(?<![a-z0-9])p\s?\.?\s?([1-6])(?!\d)/g, "ป.$1")
    .replace(/(?<![a-z0-9])m\s?\.?\s?([1-6])(?!\d)/g, "ม.$1")
    // "ป.4-6", "ป.4 - ป.6", "ป.5 ถึง ม.2" are one range, kept as one search word.
    .replace(/([ปม])\.([1-6])\s*(?:[-–—~]|ถึง|to)\s*(?:([ปม])\.)?([1-6])(?!\d)/g, (_match, from: string, fromYear: string, to: string | undefined, toYear: string) =>
      ` ${from}.${fromYear}~${to ?? from}.${toYear} `)
    // A grade glued to a word ("เกมคำศัพท์ป.3") becomes its own search word.
    .replace(/(?<!~)([ปม]\.[1-6])(?![\d~])/g, " $1 ");
}

export function normalizeDiscoveryText(value: string | null | undefined): string {
  const text = asciiDigits(cleaned(value).normalize("NFKC").toLocaleLowerCase("th"));
  return canonicalGrades(text)
    .replace(/work\s+sheets?/g, "worksheet")
    .replace(/[,;|、，]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDiscoveryFilters(filters: ResourceDiscoveryFilters): Required<ResourceDiscoveryFilters> {
  const access = filters.access === "free" || filters.access === "member" || filters.access === "pro"
    ? filters.access
    : "all";
  const grade = bounded(filters.grade);
  const type = filters.type && isResourceTypeFilter(filters.type) ? filters.type : "all";
  return {
    query: bounded(filters.query),
    category: bounded(filters.category),
    grade: isResourceGrade(grade) ? grade : "",
    access,
    type,
  };
}

// Words people use interchangeably in Thai and English, including the common
// misspellings. A search for any word in a group also matches the others; this
// only widens matching, it never invents a resource.
const SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  ["ศัพท์", "คำศัพท์", "คำศัพย์", "ศัพย์", "vocabulary", "vocab"],
  ["ไวยากรณ์", "ไวยกรณ์", "grammar", "grammer", "gramar"],
  ["คณิต", "คณิตศาสตร์", "math", "maths", "mathematics"],
  ["อังกฤษ", "ภาษาอังกฤษ", "english"],
  ["ภาษาไทย", "thai"],
  ["วิทย์", "วิทยาศาสตร์", "science"],
  ["เกม", "เกมส์", "game", "games"],
  ["ฟัง", "การฟัง", "listening"],
  ["สะกด", "สะกดคำ", "spelling"],
  ["อ่าน", "การอ่าน", "reading"],
  ["เขียน", "การเขียน", "writing"],
  ["ประโยค", "sentence"],
  ["ใบงาน", "worksheet"],
  ["เทมเพลต", "เทมเพลท", "template"],
  ["แบบฟอร์ม", "ฟอร์ม", "form"],
  ["ฟรี", "free"],
  ["โฟนิกส์", "phonics"],
  ["ตัวอักษร", "alphabet", "letters"],
];

// Compared with the already-normalized text, so Thai vowel marks (NFKC splits
// "ำ" into two code points) are written the same way on both sides.
const NORMALIZED_GROUPS: ReadonlyArray<readonly string[]> = SYNONYM_GROUPS.map((group) => group.map(normalizeDiscoveryText));

// Filler words in a natural-language search ("เกมสำหรับ ป.3", "game for p3") that
// a resource would never be required to contain. Dropped only when something
// else was typed, so a search made only of these still searches for them.
const STOP_WORDS = new Set(
  ["สื่อ", "สื่อการสอน", "การสอน", "ระดับ", "ระดับชั้น", "ชั้น", "สำหรับ", "และ", "for", "the", "a", "an", "of", "and", "with", "to"]
    .map(normalizeDiscoveryText),
);

const ASCII_WORD = /^[a-z]+$/;

/** Mistyped English words within this many edits still count (never for short words). */
function fuzzyLimit(length: number): number {
  if (length >= 9) return 2;
  if (length >= 6) return 1;
  return 0;
}

/** Optimal-string-alignment edit distance, stopping early once it exceeds `max`. */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > max) return false;
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length] <= max;
}

const LADDER_STAGE: Record<string, number> = { "ป": 0, "ม": 6 };

/** "ป.4~ป.6" -> ["ป.4", "ป.5", "ป.6"]; "ป.5~ม.2" crosses into secondary. */
function gradeRangeOf(token: string): string[] | null {
  const match = /^([ปม])\.([1-6])~([ปม])\.([1-6])$/.exec(token);
  if (!match) return null;
  const from = LADDER_STAGE[match[1]] + Number(match[2]);
  const to = LADDER_STAGE[match[3]] + Number(match[4]);
  const grades: string[] = [];
  for (let step = Math.min(from, to); step <= Math.max(from, to); step += 1) {
    grades.push(step <= 6 ? `ป.${step}` : `ม.${step - 6}`);
  }
  return grades;
}

function variantsOf(token: string): string[] {
  const range = gradeRangeOf(token);
  if (range) return range;
  if (token.length < 2) return [token];
  const found = new Set<string>([token]);
  const typo = ASCII_WORD.test(token) ? fuzzyLimit(token.length) : 0;
  for (const group of NORMALIZED_GROUPS) {
    // A word that is the start of (or inside) a group word counts as typing it
    // ("คณิต" -> คณิตศาสตร์, "gam" -> game). A longer compound is NOT widened to
    // a whole group: "เกมศัพท์" must still contain both ideas.
    const related = group.some((word) => word === token
      || (token.length >= 3 && word.includes(token))
      || (typo > 0 && ASCII_WORD.test(word) && word.length >= 5 && withinEditDistance(token, word, typo)));
    if (related) group.forEach((word) => found.add(word));
  }
  return [...found];
}

const WORD_SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter("th", { granularity: "word" })
  : null;

const THAI_ONLY = /^[\u0e00-\u0e7f]+$/;

/**
 * Thai is written without spaces, so "เกมคำศัพท์" may mean two words. Returns
 * the words of a long all-Thai search word, or null when it should stay whole.
 */
function thaiWordsOf(token: string): string[] | null {
  if (!WORD_SEGMENTER || token.length < 5 || !THAI_ONLY.test(token)) return null;
  // NFKC wrote "ำ" as two code points; give the segmenter the normal spelling.
  const plain = token.replace(/\u0e4d\u0e32/g, "\u0e33");
  const words = [...WORD_SEGMENTER.segment(plain)]
    .filter((part) => part.isWordLike && part.segment.length >= 2)
    .map((part) => normalizeDiscoveryText(part.segment));
  return words.length >= 2 ? words : null;
}

function gradeWords(grades: readonly string[] | null | undefined): string[] {
  const words = resourceGradeSearchTerms(grades);
  for (const grade of grades ?? []) {
    if (/^p[1-6]$/.test(grade)) words.push("ประถม", Number(grade[1]) <= 3 ? "ประถมต้น" : "ประถมปลาย");
    if (/^m[1-6]$/.test(grade)) words.push("มัธยม", Number(grade[1]) <= 3 ? "มัธยมต้น" : "มัธยมปลาย", Number(grade[1]) <= 3 ? "ม.ต้น" : "ม.ปลาย");
  }
  return words;
}

function resourceMode(resource: DiscoverableResource): DeliveryMode | null {
  return resource.deliveryMode ?? resource.affordance ?? null;
}

function matchesAccess(resource: DiscoverableResource, access: ResourceAccessFilter): boolean {
  if (access === "all") return true;
  if (resource.accessMode) {
    const tier = accessTier(resource.accessMode);
    return tier === (access === "member" ? "member" : access === "pro" ? "pro" : "free");
  }
  // Without an access mode only "free vs paid" is known.
  if (access === "free" || access === "member") return resource.isFree;
  return !resource.isFree;
}

// The searchable text of a resource never changes while the same object is on
// screen, so it is built once instead of on every keystroke.
const HAYSTACKS = new WeakMap<object, string>();

function haystackOf(resource: DiscoverableResource): string {
  const known = HAYSTACKS.get(resource);
  if (known !== undefined) return known;
  const built = buildHaystack(resource);
  HAYSTACKS.set(resource, built);
  return built;
}

function buildHaystack(resource: DiscoverableResource): string {
  const mode = resourceMode(resource);
  return [
    resource.title,
    resource.meta,
    resource.description,
    resource.category,
    ...(resource.tags ?? []),
    ...gradeWords(resource.gradeLevels),
    mode ? DELIVERY_TYPE_LABEL[mode] : null,
    resource.accessMode ? ACCESS_TIER_LABEL[accessTier(resource.accessMode)] : null,
  ]
    .map((value) => normalizeDiscoveryText(value))
    .filter(Boolean)
    .join(" ");
}

interface SearchWord {
  variants: string[];
  /** A long unspaced Thai phrase may also match as the words it is made of. */
  parts: string[][] | null;
  /** A long English word may be mistyped; compared with the words in the text. */
  typoLimit: number;
  text: string;
}

function searchWordsOf(query: string): SearchWord[] {
  const typed = normalizeDiscoveryText(query).split(" ").filter(Boolean).map((text) => ({ text, thai: thaiWordsOf(text) }));
  const isFiller = (item: { text: string; thai: string[] | null }) =>
    STOP_WORDS.has(item.text) || Boolean(item.thai?.every((word) => STOP_WORDS.has(word)));
  const meaningful = typed.filter((item) => !isFiller(item));
  return (meaningful.length > 0 ? meaningful : typed).map(({ text, thai }) => {
    const parts = thai?.filter((word) => !STOP_WORDS.has(word));
    return {
      text,
      variants: variantsOf(text),
      parts: parts && parts.length > 0 ? parts.map(variantsOf) : null,
      typoLimit: ASCII_WORD.test(text) ? fuzzyLimit(text.length) : 0,
    };
  });
}

function matchesWord(word: SearchWord, haystack: string, englishWords: () => string[]): boolean {
  if (word.variants.some((variant) => haystack.includes(variant))) return true;
  if (word.parts?.every((variants) => variants.some((variant) => haystack.includes(variant)))) return true;
  return word.typoLimit > 0
    && englishWords().some((candidate) => withinEditDistance(word.text, candidate, word.typoLimit));
}

export function filterDiscoveredResources<T extends DiscoverableResource>(
  resources: readonly T[],
  filters: ResourceDiscoveryFilters,
): T[] {
  const normalized = normalizeDiscoveryFilters(filters);
  const words = searchWordsOf(normalized.query);

  return resources.filter((resource) => {
    if (normalized.category && resource.category !== normalized.category) return false;
    if (normalized.grade && !resource.gradeLevels?.includes(normalized.grade) && !resource.gradeLevels?.includes("all")) return false;
    if (!matchesAccess(resource, normalized.access)) return false;
    if (normalized.type !== "all") {
      const mode = resourceMode(resource);
      if (!mode || resourceTypeOf(mode) !== normalized.type) return false;
    }
    if (words.length === 0) return true;

    const haystack = haystackOf(resource);
    let english: string[] | null = null;
    const englishWords = () => english ??= (haystack.match(/[a-z]{5,}/g) ?? []);
    return words.every((word) => matchesWord(word, haystack, englishWords));
  });
}

export function resourceDiscoveryHref(pathname: string, filters: ResourceDiscoveryFilters): string {
  const normalized = normalizeDiscoveryFilters(filters);
  const params = new URLSearchParams();
  if (normalized.query) params.set("q", normalized.query);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.grade) params.set("grade", normalized.grade);
  if (normalized.access !== "all") params.set("access", normalized.access);
  if (normalized.type !== "all") params.set("type", normalized.type);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** How many filters (not counting the search words) are narrowing the list. */
export function activeFilterCount(filters: ResourceDiscoveryFilters): number {
  const normalized = normalizeDiscoveryFilters(filters);
  return [normalized.category, normalized.grade, normalized.access !== "all", normalized.type !== "all"]
    .filter(Boolean).length;
}
