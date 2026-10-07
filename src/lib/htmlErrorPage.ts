import { NextResponse } from "next/server";

export interface ErrorPageAction {
  href: string;
  label: string;
}

const NO_STORE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_ACTION: ErrorPageAction = { href: "/app", label: "กลับไปที่แอป" };

/**
 * The next step is always a path on this site. Anything else (another origin,
 * a protocol-relative or backslash path, a script URL) falls back to the app,
 * so a future caller cannot turn this page into an open redirect or a
 * script link by passing a computed value.
 */
function internalHref(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_ACTION.href;
  }
  return value;
}

/**
 * Friendly, self-contained Thai error page for route handlers that open in a
 * new tab (resource open / download). Always `no-store` with no referrer, so
 * the page never leaks the path it was opened from and is never cached.
 * `action` defaults to the member app; pass a different one when a more
 * helpful next step exists.
 */
export function htmlErrorPage(
  status: number,
  heading: string,
  message: string,
  action?: ErrorPageAction,
): NextResponse {
  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(heading)} — KruAorry</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #faf9fc; color: #1a1a1a; text-align: center; padding: 24px; }
  main { max-width: 360px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #666; font-size: 14px; line-height: 1.6; }
  a { color: #7c3aed; display: inline-block; padding: 12px 8px; min-height: 24px; }
</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(internalHref(action?.href))}">${escapeHtml(action?.label ?? DEFAULT_ACTION.label)}</a></p>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE_HEADERS },
  });
}
