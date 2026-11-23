"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordRecentResource } from "@/lib/myHome";

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Remembers, in this browser only, that a signed-in member opened this resource, for the
 * homepage row "ใช้ล่าสุด". Reads the local session (no network call), does nothing for
 * visitors, and writes nothing to the database. Renders nothing.
 */
export function RecentViewTracker({ resourceId }: { resourceId: string }) {
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void createClient().auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (active && userId && !data.session?.user.is_anonymous) recordRecentResource(userId, resourceId);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [resourceId]);
  return null;
}
