import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/asyncTimeout";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { fetchMembershipSchemaReadiness } from "@/lib/membershipSchemaReadiness";

export const APPLICATION_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export type OwnPendingApplication =
  | { ok: true; referenceCode: string; amountThb: number }
  | { ok: false; httpStatus: 401 | 404 | 503; status: "unauthenticated" | "not_found" | "unavailable" };

/**
 * The single access check for payment details (PromptPay QR and bank account).
 * Returns the application's reference code and server-quoted amount only when
 * the caller is signed in with a permanent account, the application belongs to
 * that caller (matched by id AND user_id) and its status is still "pending".
 * The amount comes from the stored quote, never from the request.
 */
export async function loadOwnPendingApplication(applicationId: string): Promise<OwnPendingApplication> {
  try {
    const supabase = await createClient();
    const auth = await withTimeout(supabase.auth.getUser(), "payment auth");
    const authUser = auth.ok && !auth.value.error ? auth.value.data.user : null;
    if (!isPermanentAuthUser(authUser)) return { ok: false, httpStatus: 401, status: "unauthenticated" };
    if (await fetchMembershipSchemaReadiness(supabase) !== "ready") return { ok: false, httpStatus: 503, status: "unavailable" };

    const lookup = await withTimeout(Promise.resolve(supabase
      .from("upgrade_requests")
      .select("id, reference_code, plan_id, status, quoted_amount_thb")
      .eq("id", applicationId)
      .eq("user_id", authUser.id)
      .maybeSingle()), "payment application");
    if (!lookup.ok || lookup.value.error) return { ok: false, httpStatus: 503, status: "unavailable" };

    const row = lookup.value.data as { reference_code?: unknown; status?: unknown; quoted_amount_thb?: unknown } | null;
    if (!row || row.status !== "pending") return { ok: false, httpStatus: 404, status: "not_found" };
    const amountThb = Number(row.quoted_amount_thb);
    if (typeof row.reference_code !== "string" || !Number.isFinite(amountThb) || amountThb <= 0) {
      return { ok: false, httpStatus: 503, status: "unavailable" };
    }
    return { ok: true, referenceCode: row.reference_code, amountThb };
  } catch {
    return { ok: false, httpStatus: 503, status: "unavailable" };
  }
}
