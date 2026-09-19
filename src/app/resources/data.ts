import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { PUBLIC_RESOURCE_SELECT, toPublicResource, type PublicResource } from "./catalog";
import { collectResourcePages } from "./pagination";

type LoadResult = { status: "ready"; resources: PublicResource[] } | { status: "unavailable"; resources: [] };

export async function loadPublicResources(): Promise<LoadResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { status: "unavailable", resources: [] };
  }
  try {
    const client = await createClient();
    const rows = await collectResourcePages(async (from, to) => {
      const outcome = await withTimeout(
        Promise.resolve(client.from("resource_catalog").select(PUBLIC_RESOURCE_SELECT)
          .order("published_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
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
