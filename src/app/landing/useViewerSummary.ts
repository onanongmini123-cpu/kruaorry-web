"use client";

import { useEffect, useState } from "react";
import { fetchEntitlementsResult, fetchProfile, fetchSavedResourceIds } from "@/lib/data";
import { fetchMemberSubscription } from "@/lib/memberAccount";
import { createClient } from "@/lib/supabase/client";
import { summarizeViewer, type ViewerKind } from "@/lib/myHome";

export interface ViewerSummary {
  /** idle = not signed in; loading = signed in, answers not back yet. */
  status: "idle" | "loading" | "ready" | "error";
  userId: string | null;
  fullName: string | null;
  /** null while loading or when the plan could not be read (never guessed as "free"). */
  kind: ViewerKind | null;
  label: string | null;
  until: string | null;
  savedIds: string[];
}

export const IDLE_VIEWER: ViewerSummary = { status: "idle", userId: null, fullName: null, kind: null, label: null, until: null, savedIds: [] };
const LOADING_VIEWER: ViewerSummary = { ...IDLE_VIEWER, status: "loading" };

/**
 * Loads the signed-in member's own small facts (name, plan, hearts) in the browser,
 * so the cached public page stays the same for everyone. Four small own-row reads;
 * the resource list itself is reused from the page.
 */
export function useViewerSummary(signedIn: boolean): ViewerSummary {
  const [result, setResult] = useState<ViewerSummary | null>(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id ?? null;
        if (!userId) {
          if (active) setResult({ ...IDLE_VIEWER, status: "error" });
          return;
        }
        const [profile, entitlements, subscription, savedIds] = await Promise.all([
          fetchProfile(supabase, userId),
          fetchEntitlementsResult(supabase),
          fetchMemberSubscription(supabase, userId),
          fetchSavedResourceIds(supabase, userId),
        ]);
        if (!active) return;
        const planKnown = !entitlements.error && !subscription.error;
        const status = planKnown && profile ? summarizeViewer({ role: profile.role, entitlements: entitlements.entitlements, subscription: subscription.subscription }) : null;
        setResult({
          status: profile || planKnown ? "ready" : "error",
          userId,
          fullName: profile?.fullName ?? null,
          kind: status?.kind ?? (profile && (profile.role === "admin" || profile.role === "owner") ? "admin" : null),
          label: status?.label ?? (profile && (profile.role === "admin" || profile.role === "owner") ? "แอดมิน" : null),
          until: status?.until ?? null,
          savedIds,
        });
      } catch {
        if (active) setResult({ ...IDLE_VIEWER, status: "error" });
      }
    })();
    return () => { active = false; };
  }, [signedIn]);

  if (!signedIn) return IDLE_VIEWER;
  return result ?? LOADING_VIEWER;
}
