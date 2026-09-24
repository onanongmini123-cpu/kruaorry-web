import { isResourceGrade } from "@/lib/resourceGrades";

/** Open only a resource the authenticated library actually returned. */
export function resourceIdFromSearch(search: string, resources: readonly { id: string }[]): string | null {
  const requested = new URLSearchParams(search).getAll("resource");
  if (requested.length !== 1) return null;
  return resources.some((resource) => resource.id === requested[0]) ? requested[0] : null;
}

export type AppView = "home" | "library" | "favorites" | "plans" | "requests";

const APP_VIEWS = new Set<AppView>(["home", "library", "favorites", "plans", "requests"]);

export interface AppDiscoveryState {
  view: AppView;
  query: string;
  category: string;
  grade: string;
}

/** Parse only bounded, known member-app state from a login/deep-link URL. */
export function appDiscoveryStateFromSearch(search: string): AppDiscoveryState {
  const params = new URLSearchParams(search);
  const requestedView = params.getAll("view");
  const view = requestedView.length === 1 && APP_VIEWS.has(requestedView[0] as AppView)
    ? requestedView[0] as AppView
    : "home";
  const bounded = (key: string, maxLength: number) => {
    const values = params.getAll(key);
    if (values.length !== 1) return "";
    return values[0].replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  };
  const requestedGrade = bounded("grade", 32);
  return {
    view,
    query: bounded("q", 100),
    category: bounded("category", 100),
    grade: isResourceGrade(requestedGrade) ? requestedGrade : "",
  };
}
