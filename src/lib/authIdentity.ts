/**
 * Supabase anonymous sign-ins have a real user id and authenticated JWT, but
 * this product treats them as visitors until they attach a permanent identity.
 */
export function isPermanentAuthUser<T extends { id: string; is_anonymous?: boolean }>(
  user: T | null | undefined,
): user is T {
  return Boolean(user && user.is_anonymous !== true);
}
