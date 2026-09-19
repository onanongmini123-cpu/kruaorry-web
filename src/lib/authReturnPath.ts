// A login link may carry a destination, but never an arbitrary URL. Keeping
// this allowlist small prevents both open redirects and accidental navigation
// to an admin/auth route after a public-resource signup.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BASE = "https://return-path.invalid";

function hasOnlyParams(params: URLSearchParams, allowed: readonly string[]): boolean {
  const keys = [...params.keys()];
  return keys.every((key) => allowed.includes(key) && params.getAll(key).length === 1);
}

export function safeAuthNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 700 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || CONTROL.test(raw)) {
    return "/app";
  }

  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE || url.hash) return "/app";

    if (url.pathname === "/app") {
      if (!hasOnlyParams(url.searchParams, ["resource"])) return "/app";
      const resource = url.searchParams.get("resource");
      if (resource !== null && !UUID.test(resource)) return "/app";
      return url.pathname + url.search;
    }

    const match = /^\/download\/([^/]+)$/.exec(url.pathname);
    if (!match || !UUID.test(match[1]) || !hasOnlyParams(url.searchParams, ["name", "autoclose"])) {
      return "/app";
    }
    const name = url.searchParams.get("name");
    if (name !== null && (!name || name.length > 180 || CONTROL.test(name) || /[\\/]/.test(name))) return "/app";
    const autoClose = url.searchParams.get("autoclose");
    if (autoClose !== null && autoClose !== "1") return "/app";
    return url.pathname + url.search;
  } catch {
    return "/app";
  }
}
