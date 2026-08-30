// Strips anything that looks like a URL, a bearer token, a JWT, or a
// token-bearing query parameter from an error message before it is ever
// logged or returned to a caller. Defense in depth: an underlying SDK or
// network error message can embed a request URL, and for this app's
// signed-URL calls that URL can carry the download token itself — this
// makes sure that never reaches a console or an HTTP response even if the
// error text itself wasn't expected to contain it.
export function redactSensitive(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-jwt]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(token|access_token|refresh_token|apikey|api_key)=\S+/gi, "$1=[redacted]");
}
