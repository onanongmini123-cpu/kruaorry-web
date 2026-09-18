import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { PUBLIC_RESOURCE_SELECT, toPublicResource, type PublicResource } from "./catalog";

type LoadResult = { status: "ready"; resources: PublicResource[] } | { status: "unavailable"; resources: [] };

export async function loadPublicResources(): Promise<LoadResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { status: "unavailable", resources: [] };
  }
  try {
    const client = await createClient();
    const outcome = await withTimeout(
      Promise.resolve(client.from("resources").select(PUBLIC_RESOURCE_SELECT).eq("status", "published").order("published_at", { ascending: false }).limit(100)),
      "public resource listing",
    );
    if (!outcome.ok || outcome.value.error || !outcome.value.data) {
      console.error("Public resource listing is unavailable");
      return { status: "unavailable", resources: [] };
    }
    return {
      status: "ready",
      resources: outcome.value.data.map(toPublicResource).filter((item): item is PublicResource => item !== null),
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
      Promise.resolve(client.from("resources").select(PUBLIC_RESOURCE_SELECT).eq("id", id).eq("status", "published").maybeSingle()),
      "public resource detail",
    );
    return outcome.ok && !outcome.value.error ? toPublicResource(outcome.value.data) : null;
  } catch {
    console.error("Public resource detail failed");
    return null;
  }
}
