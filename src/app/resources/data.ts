import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "@/lib/entitlement";
import { PUBLIC_RESOURCE_SELECT, toPublicResource, type PublicResource, type PublicResourceViewer } from "./catalog";
import { collectResourcePages } from "./pagination";

type LoadResult = { status: "ready"; resources: PublicResource[] } | { status: "unavailable"; resources: [] };

const GUEST_VIEWER: PublicResourceViewer = {
  authenticated: false,
  role: null,
  entitlements: EMPTY_ENTITLEMENTS,
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

export async function loadPublicResources(): Promise<LoadResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { status: "unavailable", resources: [] };
  }
  try {
    const client = await createClient();
    const rows = await collectResourcePages(async (from, to) => {
      const outcome = await withTimeout(
        Promise.resolve(client.from("resource_catalog").select(PUBLIC_RESOURCE_SELECT)
          .order("published_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(from, to)),
        "public resource listing",
      );
      return outcome.ok ? outcome.value : { data: null, error: outcome.reason };
    });
    if (!rows) {
      console.error("Public resource listing is unavailable");
      return { status: "unavailable", resources: [] };
    }
    return {
      status: "ready",
      resources: rows.map(toPublicResource).filter((item): item is PublicResource => item !== null),
    };
  } catch {
    console.error("Public resource listing failed");
    return { status: "unavailable", resources: [] };
  }
}

export async function loadPublicResource(id: string): Promise<PublicResource | null> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    const client = await createClient();
    const outcome = await withTimeout(
      Promise.resolve(client.from("resource_catalog").select(PUBLIC_RESOURCE_SELECT).eq("id", id).maybeSingle()),
      "public resource detail",
    );
    return outcome.ok && !outcome.value.error ? toPublicResource(outcome.value.data) : null;
  } catch {
    console.error("Public resource detail failed");
    return null;
  }
}

export async function loadPublicResourceViewer(): Promise<PublicResourceViewer> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return GUEST_VIEWER;
  try {
    const client = await createClient();
    const auth = await withTimeout(client.auth.getUser(), "public resource viewer auth");
    const user = auth.ok ? auth.value.data.user : null;
    // Supabase anonymous sign-ins have a user id, but are still guests for
    // review/report and member entitlement purposes. Never query a profile or
    // capabilities for that temporary identity.
    if (!user || user.is_anonymous === true) return GUEST_VIEWER;

    const [profileResult, entitlementResult] = await Promise.all([
      withTimeout(
        Promise.resolve(client.from("profiles").select("role").eq("id", user.id).maybeSingle()),
        "public resource viewer profile",
      ),
      withTimeout(Promise.resolve(client.rpc("get_my_entitlements")), "public resource viewer entitlements"),
    ]);

    const roleValue = profileResult.ok && !profileResult.value.error ? profileResult.value.data?.role : null;
    const role = roleValue === "member" || roleValue === "admin" || roleValue === "owner" ? roleValue : null;
    const entitlements = entitlementResult.ok && !entitlementResult.value.error
      ? toEntitlements(entitlementResult.value.data)
      : EMPTY_ENTITLEMENTS;

    return { authenticated: true, role, entitlements };
  } catch {
    // Fail closed: a temporary session lookup failure must never turn into
    // premium access or reveal a protected destination.
    return GUEST_VIEWER;
  }
}
