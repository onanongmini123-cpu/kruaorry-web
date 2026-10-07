/**
 * Canonical path of a resource's detail page. Every link to a detail page
 * goes through here so the URL scheme (UUID today, slug once the column is
 * live) can change in one place. A resource without a slug keeps its UUID URL.
 */
export function resourceHref(resource: { id: string; slug?: string | null }): string {
  return `/resources/${resource.slug || resource.id}`;
}
