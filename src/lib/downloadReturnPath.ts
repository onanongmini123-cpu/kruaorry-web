import { AUTO_CLOSE_PARAM } from "@/lib/downloadWindow";

// Build the post-login destination from a resource id, never from a caller-
// supplied URL. The login page independently validates its `next` value.
export function downloadReturnPath(id: string, fileName?: string | null, autoClose = false): string {
  const path = `/download/${encodeURIComponent(id)}`;
  const query = new URLSearchParams();
  // Avoid turning an unusual stored filename into a rejected login return
  // path. The file is still selected by resource id, so omitting the name
  // only changes the suggested save name, never authorization or content.
  if (fileName && fileName.length <= 180 && !/[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    query.set("name", fileName);
  }
  if (autoClose) query.set(AUTO_CLOSE_PARAM, "1");
  return query.size ? `${path}?${query}` : path;
}

export function downloadLoginHref(id: string, fileName?: string | null, autoClose = false): string {
  return `/login?next=${encodeURIComponent(downloadReturnPath(id, fileName, autoClose))}`;
}
