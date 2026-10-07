import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { withTimeout } from "@/lib/asyncTimeout";
import { relatedResources } from "@/lib/relatedResources";
import { isResourceUuid, isValidSlug } from "@/lib/resourceSlug";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "@/lib/entitlement";
import { PUBLIC_RESOURCE_SELECT, PUBLIC_RESOURCE_SELECT_WITH_SLUG, resourceHref, toPublicResource, type PublicResource, type PublicResourceViewer } from "./catalog";
import { collectResourcePages } from "./pagination";

type LoadResult = { status: "ready"; resources: PublicResource[] } | { status: "unavailable"; resources: [] };

const GUEST_VIEWER: PublicResourceViewer = {
  authenticated: false,
  role: null,
  entitlements: EMPTY_ENTITLEMENTS,
  pendingPlanIds: [],
};

type EntitlementRow = {
  plan_id: string;
  feature_id: string;
  enabled: boolean;
  limit_value: number | null;
};

function toEntitlements(value: unknown): EntitlementSnapshot {
  if (!Array.isArray(value)) return EMPTY_ENTITLEMENTS;
  const rows = value.filter((row): row is EntitlementRow => Boolean(
    row && typeof row === "object"
    && typeof (row as EntitlementRow).plan_id === "string"
    && typeof (row as EntitlementRow).feature_id === "string"
    && typeof (row as EntitlementRow).enabled === "boolean",
  ));
  if (rows.length === 0) return EMPTY_ENTITLEMENTS;
  return {
    planId: rows[0].plan_id,
    features: Object.fromEntries(rows.map((row) => [
      row.feature_id,
      { enabled: row.enabled, limit: typeof row.limit_value === "number" ? row.limit_value : null },
    ])),
  };
}

const CATALOG_REVALIDATE_SECONDS = 300;

type CatalogRead = { resources: PublicResource[]; slugsLive: boolean };

function isMissingSlugColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = typeof message === "string" ? message : "";
  return (code === "42703" || code === "PGRST204" || code === "PGRST200") && /slug/i.test(text);
}

/** Every published row, newest first. Resolves `{ error }` instead of throwing. */
async function readCatalogRows(client: SupabaseClient, select: string): Promise<{ rows: unknown[] | null; error: unknown }> {
  let failure: unknown = null;
  const rows = await collectResourcePages(async (from, to) => {
    const outcome = await withTimeout(
      Promise.resolve(client.from("resource_catalog").select(select)
        .order("published_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(from, to)),
      "public resource listing",
    );
    if (!outcome.ok) {
      failure = outcome.reason;
      return { data: null, error: outcome.reason };
    }
    if (outcome.value.error) failure = outcome.value.error;
    return outcome.value as { data: unknown[] | null; error: unknown };
  });
  return { rows, error: rows ? null : failure };
}

/**
 * The public catalogue is the same for every visitor (the view is
 * viewer-independent), so it is read once with the anonymous client and shared
 * between the list, the detail page, related resources and the sitemap for a
 * few minutes. Failures throw so they are never cached.
 *
 * Deploy-safe slug support: the slug column is requested first; if the database
 * does not have it yet, the same read is repeated without it and every
 * resource simply keeps its UUID URL.
 */
async function readCatalog(): Promise<CatalogRead> {
  const client = createAnonClient();
  if (!client) throw new Error("catalog unavailable: no Supabase configuration");

  let slugsLive = true;
  let result = await readCatalogRows(client, PUBLIC_RESOURCE_SELECT_WITH_SLUG);
  if (!result.rows && isMissingSlugColumn(result.error)) {
    slugsLive = false;
    result = await readCatalogRows(client, PUBLIC_RESOURCE_SELECT);
  }
  if (!result.rows) throw new Error("catalog unavailable: read failed");
  return {
    slugsLive,
    resources: result.rows.map(toPublicResource).filter((item): item is PublicResource => item !== null),
  };
}

const readCatalogCached = unstable_cache(readCatalog, ["public-catalog-v2"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: ["catalog"],
});

export async function loadPublicResources(): Promise<LoadResult> {
  try {
    const { resources } = await readCatalogCached();
    return { status: "ready", resources };
  } catch {
    console.error("Public resource listing is unavailable");
    return { status: "unavailable", resources: [] };
  }
}

export type ResourceLookup =
  | { status: "found"; resource: PublicResource; canonicalPath: string; redirectTo: string | null }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Finds a resource by its URL key, which is either a UUID (every link made
 * before slugs existed) or a slug. `canonicalPath` is the one URL search
 * engines should keep; `redirectTo` is set when the request used a different
 * form of the same address (UUID where a slug exists, or a differently cased
 * slug) so the page can send a permanent redirect.
 */
export async function resolvePublicResource(key: string): Promise<ResourceLookup> {
  const isUuid = isResourceUuid(key);
  const lowered = key.toLowerCase();
  if (!isUuid && !isValidSlug(lowered)) return { status: "not_found" };

  let resources: PublicResource[];
  try {
    ({ resources } = await readCatalogCached());
  } catch {
    console.error("Public resource detail is unavailable");
    return { status: "unavailable" };
  }

  const resource = isUuid
    ? resources.find((item) => item.id === lowered)
    : resources.find((item) => item.slug === lowered);
  if (!resource) return { status: "not_found" };

  const canonicalPath = resourceHref(resource);
  const requestedPath = `/resources/${key}`;
  return {
    status: "found",
    resource,
    canonicalPath,
    redirectTo: canonicalPath !== requestedPath ? canonicalPath : null,
  };
}

/** Nearby published resources, from the same shared catalogue read. */
export async function loadRelatedResources(resource: PublicResource, limit = 6): Promise<PublicResource[]> {
  try {
    const { resources } = await readCatalogCached();
    return relatedResources(resource, resources.filter((item) => item.accessMode !== "locked"), limit);
  } catch {
    return [];
  }
}

export async function loadPublicResourceViewer(): Promise<PublicResourceViewer> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return GUEST_VIEWER;
  try {
    const client = await createClient();
    const auth = await withTimeout(client.auth.getUser(), "public resource viewer auth");
    const user = auth.ok && !auth.value.error ? auth.value.data.user : null;
    // Supabase anonymous sign-ins have a user id, but are still guests for
    // review/report and member entitlement purposes. Never query a profile or
    // capabilities for that temporary identity.
    if (!isPermanentAuthUser(user)) return GUEST_VIEWER;

    const [profileResult, entitlementResult, pendingResult] = await Promise.all([
      withTimeout(
        Promise.resolve(client.from("profiles").select("role").eq("id", user.id).maybeSingle()),
        "public resource viewer profile",
      ),
      withTimeout(Promise.resolve(client.rpc("get_my_entitlements")), "public resource viewer entitlements"),
      withTimeout(
        Promise.resolve(client.from("upgrade_requests").select("plan_id").eq("user_id", user.id).eq("status", "pending").limit(5)),
        "public resource viewer pending upgrade",
      ),
    ]);

    const roleValue = profileResult.ok && !profileResult.value.error ? profileResult.value.data?.role : null;
    const role = roleValue === "member" || roleValue === "admin" || roleValue === "owner" ? roleValue : null;
    const entitlements = entitlementResult.ok && !entitlementResult.value.error
      ? toEntitlements(entitlementResult.value.data)
      : EMPTY_ENTITLEMENTS;
    const pendingPlanIds = pendingResult.ok && !pendingResult.value.error && Array.isArray(pendingResult.value.data)
      ? [...new Set(pendingResult.value.data
          .map((row) => row && typeof row === "object" ? (row as { plan_id?: unknown }).plan_id : null)
          .filter((planId): planId is string => typeof planId === "string" && planId.length > 0))]
      : [];

    return { authenticated: true, role, entitlements, pendingPlanIds };
  } catch {
    // Fail closed: a temporary session lookup failure must never turn into
    // premium access or reveal a protected destination.
    return GUEST_VIEWER;
  }
}
