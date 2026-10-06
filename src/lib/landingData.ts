import { unstable_cache } from "next/cache";
import { fetchFounderCapacity, fetchPlans, fetchPublishedResources, type Plan, type Resource } from "@/lib/data";
import type { FounderCapacity } from "@/lib/founderCapacity";
import { fetchMembershipSchemaReadiness, type MembershipSchemaReadiness } from "@/lib/membershipSchemaReadiness";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * Public, viewer-independent data for the landing page. It is rendered on the
 * server so visitors see real content in the first response (no loading
 * placeholders), and cached because it only changes when staff publish.
 * `loaded` is false when the data could not be read, so the client can fall
 * back to fetching it itself instead of showing a permanently empty page.
 */
export interface LandingData {
  loaded: boolean;
  plans: Plan[];
  resources: Resource[];
  founderCapacity: FounderCapacity | null;
  readiness: MembershipSchemaReadiness;
}

export const EMPTY_LANDING_DATA: LandingData = {
  loaded: false,
  plans: [],
  resources: [],
  founderCapacity: null,
  readiness: "checking",
};

export const LANDING_REVALIDATE_SECONDS = 300;

async function readLandingData(): Promise<LandingData> {
  const supabase = createAnonClient();
  if (!supabase) return EMPTY_LANDING_DATA;
  try {
    const [plans, resources, readiness] = await Promise.all([
      fetchPlans(supabase),
      fetchPublishedResources(supabase),
      fetchMembershipSchemaReadiness(supabase),
    ]);
    const founderCapacity = readiness === "ready" ? await fetchFounderCapacity(supabase) : null;
    // The data helpers report a failed read as an empty list. Treat "no plans
    // and no resources" as not loaded so a transient outage is retried by the
    // client rather than cached as the truth.
    const loaded = plans.length > 0 || resources.length > 0;
    return { loaded, plans, resources, founderCapacity, readiness };
  } catch {
    return EMPTY_LANDING_DATA;
  }
}

export const loadLandingData = unstable_cache(readLandingData, ["landing-data-v1"], {
  revalidate: LANDING_REVALIDATE_SECONDS,
  tags: ["landing"],
});
