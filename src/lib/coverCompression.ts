// "บีบอัดรูปปกเดิม": pure helpers for the admin tool that re-saves existing cover
// pictures as small WebP files. Nothing here talks to the network.

export const COVER_BUCKET = "resource-covers";
/** One year. New cover file names are unique and never overwritten, so this is safe. */
export const COVER_CACHE_CONTROL = "31536000";
export const COVER_COMPRESS_MAX_WIDTH = 800;
export const COVER_COMPRESS_QUALITY = 0.8;
/** Only pictures bigger than this are worth re-saving. */
export const COMPRESS_THRESHOLD_BYTES = 150 * 1024;
/** Folder (inside the bucket) that holds every re-saved cover. */
export const COMPRESSED_FOLDER = "v2";
/** An 800px WebP at quality 80 is usually 40-80 KB; used only for the "estimated after" column. */
const ESTIMATED_AFTER_BYTES = 65 * 1024;

const PUBLIC_MARKER = `/storage/v1/object/public/${COVER_BUCKET}/`;

/** The object path inside the bucket for a public cover URL, or null when it is not one of ours. */
export function coverObjectPath(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 600) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (!parsed.pathname.startsWith(PUBLIC_MARKER)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(PUBLIC_MARKER.length));
    return path.length > 0 && !path.includes("..") ? path : null;
  } catch {
    return null;
  }
}

/** True for a public cover URL that already lives in the re-saved folder. */
export function isCompressedCoverUrl(url: unknown): boolean {
  return coverObjectPath(url)?.startsWith(`${COMPRESSED_FOLDER}/`) === true;
}

/** Last file name of a path, for showing a name without the whole link. */
export function coverFileName(url: string): string {
  const path = coverObjectPath(url);
  return (path ?? url).split("/").at(-1) ?? "";
}

export function estimateAfterBytes(beforeBytes: number): number {
  return Math.min(beforeBytes, ESTIMATED_AFTER_BYTES);
}

export interface CoverRow { id: string; title: string; cover_image_url: string | null }

export interface CompressionCandidate {
  id: string;
  title: string;
  url: string;
  path: string;
  bytes: number;
  estimatedAfterBytes: number;
}

/**
 * Which covers the tool offers: used by a resource, stored in this bucket, not
 * already re-saved, and bigger than the threshold. Biggest first.
 */
export function planCompression(rows: readonly CoverRow[], sizes: ReadonlyMap<string, number>): CompressionCandidate[] {
  const out: CompressionCandidate[] = [];
  for (const row of rows) {
    const path = coverObjectPath(row.cover_image_url);
    if (!path || !row.cover_image_url || path.startsWith(`${COMPRESSED_FOLDER}/`)) continue;
    const bytes = sizes.get(path);
    if (typeof bytes !== "number" || bytes <= COMPRESS_THRESHOLD_BYTES) continue;
    out.push({ id: row.id, title: row.title, url: row.cover_image_url, path, bytes, estimatedAfterBytes: estimateAfterBytes(bytes) });
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

export function totals(candidates: readonly CompressionCandidate[]): { count: number; before: number; after: number } {
  return candidates.reduce((sum, c) => ({ count: sum.count + 1, before: sum.before + c.bytes, after: sum.after + c.estimatedAfterBytes }), { count: 0, before: 0, after: 0 });
}

export function formatKb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** A new, never-reused name in the re-saved folder. */
export function newCompressedPath(uuid: string): string {
  return `${COMPRESSED_FOLDER}/${uuid}.webp`;
}

// ----- backup file (CSV) -----

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** "id,title,cover_image_url" with a BOM so Excel shows Thai titles correctly. */
export function backupCsv(rows: readonly { id: string; title: string; url: string }[]): string {
  return `﻿id,title,cover_image_url\r\n${rows.map((r) => [r.id, r.title, r.url].map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(current); current = ""; }
    else current += ch;
  }
  cells.push(current);
  return cells;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Reads a backup file back. Only well-formed ids and cover URLs of THIS bucket are
 * accepted, so an edited file can never point a resource at another site.
 */
export function parseBackupCsv(text: string): { rows: { id: string; url: string }[]; rejected: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: { id: string; url: string }[] = [];
  let rejected = 0;
  for (const line of lines.slice(1)) {
    const [id, , url] = splitCsvLine(line);
    if (id && UUID.test(id) && coverObjectPath(url) && !isCompressedCoverUrl(url)) rows.push({ id: id.toLowerCase(), url });
    else rejected += 1;
  }
  return { rows, rejected };
}
