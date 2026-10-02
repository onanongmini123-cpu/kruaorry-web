import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/asyncTimeout";

export const MEMBERSHIP_SCHEMA_READINESS_MARKER = "system.membership_payment_confirmation_v1_ready";

export const MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE =
  "ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว ยังไม่รับใบสมัคร แจ้งชำระ ยืนยันชำระ หรือต่ออายุในขณะนี้ รายการเดิมยังคงอยู่ กรุณากลับมาใหม่ภายหลัง";

export type MembershipSchemaReadiness = "checking" | "ready" | "unavailable";

type SettledMembershipSchemaReadiness = Exclude<MembershipSchemaReadiness, "checking">;

/**
 * Checks only a capability marker stored in the pre-existing `features.id`
 * column. Until the marker exists, callers must not touch payment-era columns,
 * tables or RPCs because the remote migration ledger can be ahead of the
 * actual schema.
 */
export async function fetchMembershipSchemaReadiness(
  supabase: SupabaseClient,
): Promise<SettledMembershipSchemaReadiness> {
  try {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("features")
      .select("id")
      .eq("id", MEMBERSHIP_SCHEMA_READINESS_MARKER)
      .maybeSingle()), "membership schema readiness");

    if (!outcome.ok) return "unavailable";
    const { data, error } = outcome.value;
    if (error || data?.id !== MEMBERSHIP_SCHEMA_READINESS_MARKER) return "unavailable";
    return "ready";
  } catch {
    // Building a PostgREST query is normally synchronous and side-effect free,
    // but a malformed client or SDK failure must still keep every new-schema
    // path closed rather than crashing the page.
    return "unavailable";
  }
}
