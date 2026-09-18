/** Open only a resource the authenticated library actually returned. */
export function resourceIdFromSearch(search: string, resources: readonly { id: string }[]): string | null {
  const requested = new URLSearchParams(search).getAll("resource");
  if (requested.length !== 1) return null;
  return resources.some((resource) => resource.id === requested[0]) ? requested[0] : null;
}
