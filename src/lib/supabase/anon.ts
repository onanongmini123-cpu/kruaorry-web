import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-less Supabase client for public, viewer-independent reads on the
 * server (landing page, sitemap). It carries only the public anon key, so it
 * sees exactly what an anonymous visitor sees and its results are safe to
 * cache and share. Never use it for anything that depends on who is signed in.
 */
export function createAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
