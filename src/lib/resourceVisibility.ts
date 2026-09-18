/**
 * Published rows are public, but the starter migration contains example
 * destinations. Never present those rows as usable teaching materials.
 * This is a display-quality check, not an authorization check; storage RLS
 * and the download route remain the source of truth for file access.
 */
export function publicCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "example.com" || hostname.endsWith(".example.com") ||
      hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" || hostname.endsWith(".invalid")
    ) return null;
    if (url.href.toLowerCase().includes("placeholder")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isUsableResourceTarget(resource: {
  deliveryMode: string;
  ctaUrl: string | null;
  filePath: string | null;
}): boolean {
  if (resource.deliveryMode === "file_download") {
    const path = resource.filePath?.trim();
    return Boolean(path && !path.toLowerCase().includes("placeholder"));
  }

  const target = resource.ctaUrl?.trim();
  if (!target || target.toLowerCase().includes("placeholder")) return false;

  // A relative path may point at a real tool hosted by this application.
  if (target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) {
    return true;
  }

  try {
    const url = new URL(target);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return !(
      hostname === "example.com" ||
      hostname === "example.org" ||
      hostname === "example.net" ||
      hostname.endsWith(".example.com") ||
      hostname.endsWith(".example.org") ||
      hostname.endsWith(".example.net") ||
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".invalid") ||
      hostname.endsWith(".test")
    );
  } catch {
    return false;
  }
}
