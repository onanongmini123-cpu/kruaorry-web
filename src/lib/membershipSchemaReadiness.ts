import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/asyncTimeout";

export const MEMBERSHIP_SCHEMA_READINESS_MARKER = "system.membership_payment_confirmation_v1_ready";
export const FOUNDER_FIRST_YEAR_READINESS_MARKER = "system.founder_first_year_once_v1_ready";
export const MEMBERSHIP_LINE_SLIP_WORKFLOW_READINESS_MARKER = "system.membership_line_slip_workflow_v1_ready";
export const RESOURCE_ISSUE_CONTEXT_READINESS_MARKER = "system.resource_issue_context_v1_ready";

export const MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE =
  "ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว ยังไม่รับใบสมัคร แจ้งชำระ ยืนยันชำระ หรือต่ออายุในขณะนี้ รายการเดิมยังคงอยู่ กรุณากลับมาใหม่ภายหลัง";
export const MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE =
  "ระบบบันทึกรับสลิปจาก LINE ยังไม่พร้อม กรุณาอย่ายืนยันยอดจนกว่าจะบันทึกรับสลิปสำเร็จ";

export type MembershipSchemaReadiness = "checking" | "ready" | "unavailable";

type SettledMembershipSchemaReadiness = Exclude<MembershipSchemaReadiness, "checking">;

async function fetchCapabilityReadiness(
  supabase: SupabaseClient,
  marker: string,
  operationLabel: string,
): Promise<SettledMembershipSchemaReadiness> {
  try {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("features")
      .select("id")
      .eq("id", marker)
      .maybeSingle()), operationLabel);

    if (!outcome.ok) return "unavailable";
    const { data, error } = outcome.value;
    if (error || data?.id !== marker) return "unavailable";
    return "ready";
  } catch {
    // Building a PostgREST query is normally synchronous and side-effect free,
    // but a malformed client or SDK failure must still keep the capability
    // closed rather than crashing the page.
    return "unavailable";
  }
}

/**
 * Checks only a capability marker stored in the pre-existing `features.id`
 * column. Until the marker exists, callers must not touch payment-era columns,
 * tables or RPCs because the remote migration ledger can be ahead of the
 * actual schema.
 */
export async function fetchMembershipSchemaReadiness(
  supabase: SupabaseClient,
): Promise<SettledMembershipSchemaReadiness> {
  return fetchCapabilityReadiness(
    supabase,
    MEMBERSHIP_SCHEMA_READINESS_MARKER,
    "membership schema readiness",
  );
}

/**
 * Probes migration 049 before any client calls its Founder-history RPC. This
 * keeps a Preview connected to the pre-049 production schema fail-closed
 * without generating a PostgREST missing-function error.
 */
export async function fetchFounderFirstYearReadiness(
  supabase: SupabaseClient,
): Promise<SettledMembershipSchemaReadiness> {
  return fetchCapabilityReadiness(
    supabase,
    FOUNDER_FIRST_YEAR_READINESS_MARKER,
    "Founder first-year readiness",
  );
}

/**
 * Probes migration 050 independently from the 048 membership gate. A staged
 * rollout can keep application/status reads working while only the new
 * admin-side LINE receipt action remains disabled.
 */
export async function fetchMembershipLineSlipWorkflowReadiness(
  supabase: SupabaseClient,
): Promise<SettledMembershipSchemaReadiness> {
  return fetchCapabilityReadiness(
    supabase,
    MEMBERSHIP_LINE_SLIP_WORKFLOW_READINESS_MARKER,
    "membership LINE slip workflow readiness",
  );
}

/**
 * Probes migration 054 (extra problem-report categories and context) so the
 * report form only offers what the database will accept.
 */
export async function fetchResourceIssueContextReadiness(
  supabase: SupabaseClient,
): Promise<SettledMembershipSchemaReadiness> {
  return fetchCapabilityReadiness(
    supabase,
    RESOURCE_ISSUE_CONTEXT_READINESS_MARKER,
    "resource issue context readiness",
  );
}
