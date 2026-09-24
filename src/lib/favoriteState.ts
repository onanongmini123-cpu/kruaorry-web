export type FavoriteStateUpdater = (update: (current: string[]) => string[]) => void;

export function updateFavoriteIds(current: readonly string[], resourceId: string, saved: boolean): string[] {
  if (saved) return current.includes(resourceId) ? [...current] : [...current, resourceId];
  return current.filter((id) => id !== resourceId);
}

/** Apply immediately, then roll back only this resource if persistence fails. */
export async function persistFavoriteOptimistically(
  resourceId: string,
  desiredSaved: boolean,
  apply: FavoriteStateUpdater,
  persist: () => Promise<string | null>,
): Promise<string | null> {
  apply((current) => updateFavoriteIds(current, resourceId, desiredSaved));
  try {
    const error = await persist();
    if (error) apply((current) => updateFavoriteIds(current, resourceId, !desiredSaved));
    return error;
  } catch {
    apply((current) => updateFavoriteIds(current, resourceId, !desiredSaved));
    return "Favorite request failed";
  }
}
