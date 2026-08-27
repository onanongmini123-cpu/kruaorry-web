import { createBrowserClient } from "@supabase/ssr";

// Next.js server-renders "use client" pages once for the initial HTML shell
// (during the build's static export pass, and again per-request), so this
// runs outside the browser too. @supabase/ssr throws immediately if the
// URL/key are missing, which would otherwise crash that shell render before
// the real client-side check ever gets a chance to run. Falling back to a
// placeholder there is safe: nothing calls this client until after mount.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  return createBrowserClient(url, key);
}
