/**
 * The public address of the site. Canonical URLs, the sitemap, robots and
 * share previews all derive from this single value; it must match the domain
 * visitors are sent to (the primary domain in the hosting project).
 */
export const SITE_ORIGIN = "https://kruaorry.com";
export const SITE_NAME = "KruAorry";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
