export function isAuthenticatedAccount<T>(
  user: T | null | undefined,
): user is T & { is_anonymous?: false } {
  return Boolean(
    user
    && typeof user === "object"
    && (user as { is_anonymous?: boolean }).is_anonymous !== true,
  );
}
