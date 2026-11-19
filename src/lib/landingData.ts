import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFounderCapacity, fetchPlans, type Plan, type Resource } from "@/lib/data";
import { loadPublicResources } from "@/app/resources/data";
import type { PublicResource } from "@/app/resources/catalog";
import type { FounderCapacity } from "@/lib/founderCapacity";
import { fetchMembershipSchemaReadiness, type MembershipSchemaReadiness } from "@/lib/membershipSchemaReadiness";
import { createAnonClient } from "@/lib/supabase/anon";
import { parseHomepageVideos, type HomepageVideo } from "@/lib/homepageVideos";
import { withTimeout } from "@/lib/asyncTimeout";

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
  /** Admin-chosen homepage videos (0–3). Empty hides the section. */
  videos: HomepageVideo[];
}

export const EMPTY_LANDING_DATA: LandingData = {
  loaded: false,
  plans: [],
  resources: [],
  founderCapacity: null,
  readiness: "checking",
  videos: [],
};

export const LANDING_REVALIDATE_SECONDS = 300;

/**
 * The landing page reads the same cached public catalogue as /resources, so it
 * links to the same readable address (slug) and the database is asked once
 * for both instead of twice.
 */
export function toLandingResource(item: PublicResource): Resource {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    meta: item.meta,
    description: item.description || null,
    category: item.category || null,
    affordance: item.deliveryMode,
    coverImageUrl: item.coverImageUrl,
    tags: item.tags,
    gradeLevels: item.gradeLevels,
    accessMode: item.accessMode,
    requiredPlanIds: item.requiredPlanIds,
    requiredPlanNames: item.requiredPlanNames,
    free: item.isFree,
    isNew: item.isNew,
    trialAvailable: item.trialAvailable,
    fileSize: null,
    featuredRank: item.featuredRank,
    reviewAverage: item.reviewAverage,
    reviewCount: item.reviewCount,
  };
}

/** Never throws: before migration 058 (or on any failure) there are simply no videos. */
async function readHomepageVideos(supabase: SupabaseClient): Promise<HomepageVideo[]> {
  try {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("homepage_videos")
      .select("position, youtube_video_id, title")
      .order("position", { ascending: true })
      .limit(10)), "homepage videos");
    if (!outcome.ok || outcome.value.error) return [];
    return parseHomepageVideos(outcome.value.data);
  } catch {
    return [];
  }
}

async function readLandingData(): Promise<LandingData> {
  const supabase = createAnonClient();
  if (!supabase) return EMPTY_LANDING_DATA;
  try {
    const [plans, catalogue, readiness, videos] = await Promise.all([
      fetchPlans(supabase),
      loadPublicResources(),
      fetchMembershipSchemaReadiness(supabase),
      readHomepageVideos(supabase),
    ]);
    const resources = catalogue.status === "ready" ? catalogue.resources.map(toLandingResource) : [];
    const founderCapacity = readiness === "ready" ? await fetchFounderCapacity(supabase) : null;
    // The data helpers report a failed read as an empty list. Treat "no plans
    // and no resources" as not loaded so a transient outage is retried by the
    // client rather than cached as the truth.
    const loaded = plans.length > 0 || resources.length > 0;
    return { loaded, plans, resources, founderCapacity, readiness, videos };
  } catch {
    return EMPTY_LANDING_DATA;
  }
}

export const loadLandingData = unstable_cache(readLandingData, ["landing-data-v1"], {
  revalidate: LANDING_REVALIDATE_SECONDS,
  tags: ["landing"],
});
