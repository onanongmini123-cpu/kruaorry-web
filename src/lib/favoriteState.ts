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

/**
 * A refresh of the saved list that began before a heart was pressed (for example
 * when the browser tab regains focus) can arrive after the optimistic update and
 * put the heart back to its old state. The guard lets the app drop such a stale
 * answer: a refresh may be applied only if no favourite write is running and none
 * has started or finished since the refresh began.
 */
export function createFavoriteRefreshGuard() {
  let writes = 0;
  let inFlight = 0;
  return {
    /** Call when a favourite write starts; call the returned function when it settles. */
    beginWrite(): () => void {
      writes += 1;
      inFlight += 1;
      return () => {
        writes += 1;
        inFlight -= 1;
      };
    },
    /** Call before fetching the saved list; apply the answer only if the returned check passes. */
    beginRefresh(): () => boolean {
      const startedAt = writes;
      return () => inFlight === 0 && writes === startedAt;
    },
  };
}
