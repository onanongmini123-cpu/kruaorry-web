import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "./asyncTimeout";

export type PublicAuthState = "checking" | "guest" | "member";

export interface PublicAuthAction {
  href: string;
  label: string;
  emphasis: "ghost" | "primary";
}

export function initialPublicAuthState(configured: boolean): PublicAuthState {
  return configured ? "checking" : "guest";
}

export function publicHeaderActions(state: PublicAuthState): PublicAuthAction[] {
  if (state === "checking") return [];
  if (state === "member") {
    return [{ href: "/app", label: "ไปพื้นที่สมาชิก", emphasis: "primary" }];
  }
  return [
    { href: "/login", label: "เข้าสู่ระบบ", emphasis: "ghost" },
    { href: "/login?mode=signup&next=%2Fapp", label: "สมัครฟรี", emphasis: "primary" },
  ];
}

export function publicFreeAccountAction(state: PublicAuthState): Omit<PublicAuthAction, "emphasis"> | null {
  if (state === "checking") return null;
  return state === "member"
    ? { href: "/app", label: "ไปพื้นที่สมาชิก" }
    : { href: "/login?mode=signup&next=%2Fapp", label: "สมัครสมาชิกฟรี" };
}

/**
 * Resolve the authenticated public-home CTA without trusting a cached session,
 * then keep it aligned with later sign-in/sign-out events. A newer auth event
 * always wins over an older in-flight getUser() response.
 */
export function observePublicAuthState(
  auth: SupabaseClient["auth"],
  onState: (state: Exclude<PublicAuthState, "checking">) => void,
): () => void {
  let active = true;
  let authEventVersion = 0;
  const initialRequestVersion = authEventVersion;
  const initialUserRequest = withTimeout(
    Promise.resolve().then(() => auth.getUser()),
    "public home auth check",
  );

  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    // getUser() is the authoritative initial check. Subsequent events keep the
    // public CTA current while this page remains mounted.
    if (event === "INITIAL_SESSION") return;
    authEventVersion += 1;
    if (active) onState(session?.user ? "member" : "guest");
  });

  void initialUserRequest.then((outcome) => {
    if (!active || authEventVersion !== initialRequestVersion) return;
    onState(outcome.ok && outcome.value.data.user ? "member" : "guest");
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
