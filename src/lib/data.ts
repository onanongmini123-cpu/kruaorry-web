import { Sparkles, FileSpreadsheet, Gamepad2, ClipboardCheck, FileDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceAffordance } from "@/components/ui";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/asyncTimeout";
import { redactSensitive } from "@/lib/redact";
import { type EntitlementSnapshot, type ResourceAccessMode } from "@/lib/entitlement";
import { normalizeFounderCapacity, type FounderCapacity } from "@/lib/founderCapacity";
import {
  fetchFounderFirstYearReadiness,
  fetchMembershipLineSlipWorkflowReadiness,
  fetchMembershipSchemaReadiness,
  MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
  MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
} from "@/lib/membershipSchemaReadiness";
import { planDisplayName, planDisplayNames } from "@/lib/planDisplay";
import { friendlyErrorMessage } from "@/lib/userMessages";
import { customerBenefitCopy } from "@/lib/benefitCopy";

function logError(label: string, error: PostgrestError) {
  // PostgREST details/messages can echo submitted values (for example a
  // payment reference in a unique-constraint error). Keep diagnostics useful
  // without writing member or payment data to the browser console.
  console.error(`${label} (code=${error.code || "unknown"})`);
}

export interface Resource {
  id: string;
  title: string;
  meta: string;
  description: string | null;
  category: string | null;
  affordance: ResourceAffordance;
  coverImageUrl: string | null;
  tags: string[];
  gradeLevels: string[];
  accessMode: ResourceAccessMode;
  requiredPlanIds: string[];
  requiredPlanNames: string[];
  free: boolean;
  isNew: boolean;
  fileSize: number | null;
  featuredRank: number | null;
  reviewAverage: number | null;
  reviewCount: number;
}

interface ResourceCatalogRow {
  id: string;
  title: string;
  meta: string | null;
  description: string | null;
  category: string | null;
  delivery_mode: string;
  cover_image_url: string | null;
  tags: string[] | null;
  grade_levels: string[] | null;
  access_mode: ResourceAccessMode;
  required_plan_ids: string[] | null;
  required_plan_names: string[] | null;
  is_free: boolean;
  is_new: boolean;
  file_size: number | null;
  featured_rank: number | null;
  review_average: number | string | null;
  review_count: number | string | null;
}

export interface PlanBenefit {
  featureId: string;
  name: string;
  description: string | null;
  valueType: "boolean" | "integer";
  limitValue: number | null;
}

export interface Plan {
  id: string;
  name: string;
  priceLabel: string;
  note: string | null;
  features: string[];
  benefits: PlanBenefit[];
  billingInterval: "month" | "year" | "lifetime" | null;
  isPopular: boolean;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: "member" | "admin" | "owner";
  plan: string;
  avatarPath: string | null;
}

const ICON_BY_MODE: Record<ResourceAffordance, LucideIcon> = {
  web_app: Gamepad2,
  google_template: FileSpreadsheet,
  google_form: ClipboardCheck,
  file_download: FileDown,
};

const TINT_BY_MODE: Record<ResourceAffordance, "purple" | "pink" | "blue"> = {
  web_app: "pink",
  google_template: "blue",
  google_form: "purple",
  file_download: "blue",
};

const RESOURCE_ACCESS_MODES = new Set<ResourceAccessMode>(["public", "authenticated", "plans", "locked"]);

function resourceAccessMode(value: unknown): ResourceAccessMode {
  return RESOURCE_ACCESS_MODES.has(value as ResourceAccessMode) ? value as ResourceAccessMode : "locked";
}

export function resourceIcon(affordance: ResourceAffordance): LucideIcon {
  return ICON_BY_MODE[affordance] ?? Sparkles;
}

export function resourceTint(affordance: ResourceAffordance): "purple" | "pink" | "blue" {
  return TINT_BY_MODE[affordance] ?? "purple";
}

export async function fetchPublishedResources(supabase: SupabaseClient): Promise<Resource[]> {
  const pageSize = 500;
  const rows: ResourceCatalogRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("resource_catalog")
      .select("id, title, meta, description, category, delivery_mode, cover_image_url, tags, grade_levels, access_mode, required_plan_ids, required_plan_names, is_free, is_new, file_size, featured_rank, review_average, review_count")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)), "published resource listing");

    if (!outcome.ok) {
      console.error(`fetchPublishedResources failed: ${outcome.reason}`);
      return [];
    }
    const { data, error } = outcome.value;
    if (error) logError("fetchPublishedResources failed", error);
    if (error || !data) return [];
    rows.push(...data as ResourceCatalogRow[]);
    if (data.length < pageSize) break;
  }

  return rows.map((r) => {
    const accessMode = resourceAccessMode(r.access_mode);
    return {
      id: r.id,
      title: r.title,
      meta: r.meta ?? "",
      description: r.description,
      category: r.category,
      affordance: r.delivery_mode as ResourceAffordance,
      coverImageUrl: r.cover_image_url,
      tags: r.tags ?? [],
      gradeLevels: r.grade_levels ?? [],
      accessMode,
      requiredPlanIds: r.required_plan_ids ?? [],
      requiredPlanNames: planDisplayNames(r.required_plan_ids ?? [], r.required_plan_names ?? []),
      free: accessMode === "public" || accessMode === "authenticated",
      isNew: r.is_new === true,
      fileSize: r.file_size,
      featuredRank: typeof r.featured_rank === "number" ? r.featured_rank : null,
      reviewAverage: r.review_average === null ? null : Number(r.review_average),
      reviewCount: Number(r.review_count ?? 0),
    };
  });
}

const RESOURCE_FILES_BUCKET = "resource-files";

export interface SignedFileUrlResult {
  url: string | null;
  error: string | null;
}

// Generates a short-lived signed URL for a private resource file. RLS on
// storage.objects enforces publish status + plan entitlement server-side;
// this only succeeds if the caller is actually allowed to read the object.
// `download` sets Content-Disposition: attachment on Supabase's response,
// so navigating to the URL downloads the file instead of rendering it.
//
// Called from the /api/resources/[id]/download route handler (server-side,
// with a per-request client bound to the caller's own session — RLS still
// applies exactly as it would client-side, no service-role key involved).
// Previously this was called directly from the browser before navigating a
// pre-opened blank tab; that pattern turned out to be unreliable (an async
// gap between window.open() and setting its location gets treated as an
// untrusted navigation by some browsers, and a hang here left the blank tab
// stuck forever with no feedback) — see the route handler for the fix.
//
// Never throws (withTimeout bounds and catches the underlying call), and
// never logs or returns the resulting signed URL itself. The object path is
// also omitted from logs because an uploaded filename can contain personal
// data; underlying error text is redacted before it can reach the caller.
export async function getSignedFileUrl(supabase: SupabaseClient, filePath: string, fileName?: string | null, expiresInSeconds = 60): Promise<SignedFileUrlResult> {
  const result = await withTimeout(supabase.storage.from(RESOURCE_FILES_BUCKET).createSignedUrl(filePath, expiresInSeconds, { download: fileName || true }), "createSignedUrl");

  if (!result.ok) {
    console.error("getSignedFileUrl failed before Supabase returned a result");
    return { url: null, error: result.reason };
  }
  const { data, error } = result.value;
  if (error || !data) {
    const message = redactSensitive(error?.message ?? "no data returned");
    console.error("getSignedFileUrl failed after Supabase returned an error");
    return { url: null, error: message };
  }
  return { url: data.signedUrl, error: null };
}

export async function fetchPlans(supabase: SupabaseClient): Promise<Plan[]> {
  const [planOutcome, benefitOutcome] = await Promise.all([
    withTimeout(Promise.resolve(supabase
      .from("plans")
      .select("id, name, price_label, note, is_popular, billing_interval")
      .eq("is_public", true)
      .eq("lifecycle_status", "active")
      .order("sort_order", { ascending: true })), "public plan listing"),
    withTimeout(Promise.resolve(supabase
      .from("plan_benefit_catalog")
      .select("plan_id, feature_id, feature_name, feature_description, value_type, limit_value, sort_order")
      .order("sort_order", { ascending: true })
      .order("feature_id", { ascending: true })), "plan benefit listing"),
  ]);

  if (!planOutcome.ok) {
    console.error(`fetchPlans failed: ${planOutcome.reason}`);
    return [];
  }
  const { data, error } = planOutcome.value;

  if (error) logError("fetchPlans failed", error);
  if (error || !data) return [];

  const benefitRows = benefitOutcome.ok && !benefitOutcome.value.error
    ? benefitOutcome.value.data ?? []
    : [];
  if (!benefitOutcome.ok) console.error(`fetchPlans benefits failed: ${benefitOutcome.reason}`);
  else if (benefitOutcome.value.error) logError("fetchPlans benefits failed", benefitOutcome.value.error);

  return data.map((p) => ({
    id: p.id,
    name: planDisplayName(p.id, p.name),
    priceLabel: p.price_label,
    note: p.note,
    benefits: benefitRows
      .filter((benefit) => benefit.plan_id === p.id)
      .map((benefit) => {
        const copy = customerBenefitCopy({
          featureId: benefit.feature_id,
          name: benefit.feature_name,
          description: benefit.feature_description,
        });
        return {
          featureId: benefit.feature_id,
          name: copy.name,
          description: copy.description,
          valueType: benefit.value_type as PlanBenefit["valueType"],
          limitValue: benefit.limit_value === null ? null : Number(benefit.limit_value),
        };
      }),
    features: benefitRows
      .filter((benefit) => benefit.plan_id === p.id)
      .map((benefit) => customerBenefitCopy({
        featureId: benefit.feature_id,
        name: benefit.feature_name,
        description: benefit.feature_description,
      }).name),
    billingInterval: p.billing_interval === "year"
      ? "year"
      : p.billing_interval === "one_time"
        ? "lifetime"
        : p.billing_interval === "month"
          ? "month"
          : null,
    isPopular: p.is_popular ?? false,
  }));
}

export async function fetchFounderCapacity(supabase: SupabaseClient): Promise<FounderCapacity | null> {
  if (await fetchMembershipSchemaReadiness(supabase) !== "ready") return null;

  const outcome = await withTimeout(Promise.resolve(supabase.rpc("get_founder_capacity")), "Founder capacity");
  if (!outcome.ok) {
    console.error(`fetchFounderCapacity failed: ${outcome.reason}`);
    return null;
  }

  const { data, error } = outcome.value;
  if (error) {
    logError("fetchFounderCapacity failed", error);
    return null;
  }
  return normalizeFounderCapacity(data);
}

interface EntitlementRow {
  plan_id: string;
  feature_id: string;
  enabled: boolean;
  limit_value: number | null;
}

export type EntitlementsResult =
  | { entitlements: EntitlementSnapshot; error: false }
  | { entitlements: null; error: true };

export async function fetchEntitlementsResult(supabase: SupabaseClient): Promise<EntitlementsResult> {
  const outcome = await withTimeout(
    Promise.resolve().then(() => supabase.rpc("get_my_entitlements")),
    "member entitlements",
  );
  if (!outcome.ok) {
    console.error(`fetchEntitlements failed: ${outcome.reason}`);
    return { entitlements: null, error: true };
  }

  const { data, error } = outcome.value;
  if (error) {
    logError("fetchEntitlements failed", error);
    return { entitlements: null, error: true };
  }

  const rows = (data ?? []) as EntitlementRow[];
  const planId = rows[0]?.plan_id ?? "free";
  const features = Object.fromEntries(
    rows.map((row) => [row.feature_id, { enabled: row.enabled, limit: row.limit_value }]),
  );
  return { entitlements: { planId, features }, error: false };
}

export async function fetchEntitlements(supabase: SupabaseClient): Promise<EntitlementSnapshot | null> {
  return (await fetchEntitlementsResult(supabase)).entitlements;
}

export interface TeacherRequest {
  id: string;
  title: string;
  votes: number;
  status: "pending" | "in_progress" | "done";
}

export async function fetchRequests(supabase: SupabaseClient): Promise<TeacherRequest[]> {
  const { data, error } = await supabase
    .from("requests")
    .select("id, title, votes, status")
    .order("votes", { ascending: false });

  if (error) logError("fetchRequests failed", error);
  if (error || !data) return [];
  return data;
}

export async function submitRequest(supabase: SupabaseClient, title: string): Promise<string | null> {
  const { error } = await supabase.rpc("submit_my_request", { p_title: title.trim() });
  if (error) {
    logError("submitRequest failed", error);
    return friendlyErrorMessage(error, "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return null;
}

export async function fetchSavedResourceIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const pageSize = 500;
  const ids: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const outcome = await withTimeout(Promise.resolve(supabase
      .from("saved_resources")
      .select("resource_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("resource_id", { ascending: true })
      .range(from, from + pageSize - 1)), "saved resource listing");
    if (!outcome.ok) {
      console.error(`fetchSavedResourceIds failed: ${outcome.reason}`);
      return [];
    }
    const { data, error } = outcome.value;
    if (error) logError("fetchSavedResourceIds failed", error);
    if (error || !data) return [];
    ids.push(...data.map((row) => row.resource_id));
    if (data.length < pageSize) break;
  }
  return ids;
}

export async function setResourceSaved(supabase: SupabaseClient, resourceId: string, saved: boolean): Promise<string | null> {
  const outcome = await withTimeout(Promise.resolve(supabase.rpc("set_my_resource_saved", {
    p_resource_id: resourceId,
    p_saved: saved,
  })), "save resource");
  if (!outcome.ok) {
    console.error(`setResourceSaved failed: ${outcome.reason}`);
    return outcome.reason;
  }
  const { error } = outcome.value;
  if (error) logError(`setResourceSaved (${saved ? "save" : "unsave"}) failed`, error);
  return error?.message ?? null;
}

export interface UpgradeRequest {
  id: string;
  referenceCode: string;
  planId: string;
  status: "pending" | "approved" | "declined";
  quotedAmountThb: number;
  paymentReportedAt: string | null;
  lineSlipReceivedAt: string | null;
  paymentPaidAt: string | null;
  paymentConfirmedAt: string | null;
  paymentConfirmedAmountThb: number | null;
  paymentReference: string | null;
  resolutionReasonCode: string | null;
  createdAt: string;
}

interface UpgradeRequestRow {
  id: string;
  reference_code: string;
  plan_id: string;
  status: "pending" | "approved" | "declined";
  quoted_amount_thb: number;
  payment_reported_at: string | null;
  line_slip_received_at?: string | null;
  payment_paid_at: string | null;
  payment_confirmed_at: string | null;
  payment_confirmed_amount_thb: number | null;
  payment_reference: string | null;
  resolution_reason_code: string | null;
  created_at: string;
}

interface CreatedMembershipApplicationRow {
  id: string;
  reference_code: string;
  plan_id: string;
  status: "pending" | "approved" | "declined";
  quoted_amount_thb: number;
  payment_reported_at: string | null;
  line_slip_received_at?: string | null;
  created_at: string;
}

export interface MembershipApplicationMutationResult {
  application: UpgradeRequest | null;
  error: string | null;
}

export interface ManualPaymentConfirmation {
  amountThb: number;
  paymentReference: string;
  paidAt: string;
  idempotencyKey: string;
}

function membershipApplicationFromRow(row: CreatedMembershipApplicationRow | UpgradeRequestRow): UpgradeRequest | null {
  const quotedAmountThb = Number(row.quoted_amount_thb);
  if (!row.id || !row.reference_code || !row.plan_id || !["pending", "approved", "declined"].includes(row.status)) return null;
  if (!Number.isInteger(quotedAmountThb) || quotedAmountThb < 0 || !row.created_at) return null;

  const persisted = row as Partial<UpgradeRequestRow>;
  return {
    id: row.id,
    referenceCode: row.reference_code,
    planId: row.plan_id,
    status: row.status,
    quotedAmountThb,
    paymentReportedAt: persisted.payment_reported_at ?? null,
    lineSlipReceivedAt: persisted.line_slip_received_at ?? null,
    paymentPaidAt: persisted.payment_paid_at ?? null,
    paymentConfirmedAt: persisted.payment_confirmed_at ?? null,
    paymentConfirmedAmountThb: persisted.payment_confirmed_amount_thb === null || persisted.payment_confirmed_amount_thb === undefined
      ? null
      : Number(persisted.payment_confirmed_amount_thb),
    paymentReference: persisted.payment_reference ?? null,
    resolutionReasonCode: persisted.resolution_reason_code ?? null,
    createdAt: row.created_at,
  };
}

export interface UpgradeRequestsResult {
  applications: UpgradeRequest[];
  error: boolean;
}

export interface FounderHistoryResult {
  hasFounderHistory: boolean;
  error: boolean;
}

export interface MembershipReturnResourceResult {
  requiredPlanIds: string[];
  error: boolean;
}

export async function fetchMyFounderHistory(supabase: SupabaseClient): Promise<FounderHistoryResult> {
  if (await fetchFounderFirstYearReadiness(supabase) !== "ready") {
    return { hasFounderHistory: false, error: true };
  }
  const outcome = await withTimeout(
    Promise.resolve(supabase.rpc("has_my_founder_history")),
    "Founder membership history",
  );
  if (!outcome.ok) {
    console.error(`fetchMyFounderHistory failed: ${outcome.reason}`);
    return { hasFounderHistory: false, error: true };
  }
  const { data, error } = outcome.value;
  if (error || typeof data !== "boolean") {
    if (error) logError("fetchMyFounderHistory failed", error);
    return { hasFounderHistory: false, error: true };
  }
  return { hasFounderHistory: data, error: false };
}

export async function fetchMembershipReturnResource(
  supabase: SupabaseClient,
  resourceId: string,
): Promise<MembershipReturnResourceResult> {
  const outcome = await withTimeout(Promise.resolve(supabase
    .from("resource_catalog")
    .select("access_mode, required_plan_ids")
    .eq("id", resourceId)
    .maybeSingle()), "membership return resource");
  if (!outcome.ok) {
    console.error(`fetchMembershipReturnResource failed: ${outcome.reason}`);
    return { requiredPlanIds: [], error: true };
  }
  const { data, error } = outcome.value;
  if (error || !data || data.access_mode !== "plans" || !Array.isArray(data.required_plan_ids)) {
    if (error) logError("fetchMembershipReturnResource failed", error);
    return { requiredPlanIds: [], error: true };
  }
  return {
    requiredPlanIds: [...new Set(data.required_plan_ids.filter(
      (planId): planId is string => typeof planId === "string" && planId.trim().length > 0,
    ).map(
      (planId) => planId.trim(),
    ))],
    error: false,
  };
}

export async function fetchUpgradeRequestsResult(supabase: SupabaseClient, userId: string): Promise<UpgradeRequestsResult> {
  const [schemaReadiness, lineSlipReadiness] = await Promise.all([
    fetchMembershipSchemaReadiness(supabase),
    fetchMembershipLineSlipWorkflowReadiness(supabase),
  ]);
  if (schemaReadiness !== "ready") {
    return { applications: [], error: true };
  }

  const requestQuery = lineSlipReadiness === "ready"
    ? supabase.from("upgrade_requests")
      .select("id, reference_code, plan_id, status, quoted_amount_thb, payment_reported_at, line_slip_received_at, payment_paid_at, payment_confirmed_at, payment_confirmed_amount_thb, payment_reference, resolution_reason_code, created_at")
    : supabase.from("upgrade_requests")
      .select("id, reference_code, plan_id, status, quoted_amount_thb, payment_reported_at, payment_paid_at, payment_confirmed_at, payment_confirmed_amount_thb, payment_reference, resolution_reason_code, created_at");

  const { data, error } = await requestQuery
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) logError("fetchUpgradeRequests failed", error);
  if (error || !data) return { applications: [], error: true };
  return {
    applications: (data as UpgradeRequestRow[])
    .map(membershipApplicationFromRow)
    .filter((application): application is UpgradeRequest => application !== null),
    error: false,
  };
}

export async function fetchUpgradeRequests(supabase: SupabaseClient, userId: string): Promise<UpgradeRequest[]> {
  return (await fetchUpgradeRequestsResult(supabase, userId)).applications;
}

export async function createMembershipApplication(supabase: SupabaseClient, planId: string): Promise<MembershipApplicationMutationResult> {
  if (await fetchMembershipSchemaReadiness(supabase) !== "ready") {
    return { application: null, error: MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE };
  }

  const outcome = await withTimeout(Promise.resolve(supabase.rpc("create_membership_application", {
    p_plan_id: planId,
  })), "create membership application");
  if (!outcome.ok) return { application: null, error: outcome.reason };

  const { data, error } = outcome.value;
  if (error) {
    logError("createMembershipApplication failed", error);
    return { application: null, error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as CreatedMembershipApplicationRow | null;
  const application = row ? membershipApplicationFromRow(row) : null;
  return application
    ? { application, error: null }
    : { application: null, error: "ระบบไม่ได้ส่งข้อมูลใบสมัครกลับมา กรุณาลองอีกครั้ง" };
}

async function mutateMembershipApplication(
  supabase: SupabaseClient,
  rpcName: "record_membership_line_slip_received" | "convert_founder_application_to_teacher",
  requestId: string,
  operationLabel: string,
  readiness: (client: SupabaseClient) => Promise<"ready" | "unavailable"> = fetchMembershipSchemaReadiness,
  unavailableMessage = MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
): Promise<MembershipApplicationMutationResult> {
  if (await readiness(supabase) !== "ready") {
    return { application: null, error: unavailableMessage };
  }

  const outcome = await withTimeout(Promise.resolve(supabase.rpc(rpcName, {
    p_request_id: requestId,
  })), operationLabel);
  if (!outcome.ok) return { application: null, error: outcome.reason };

  const { data, error } = outcome.value;
  if (error) {
    logError(`${rpcName} failed`, error);
    return { application: null, error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as CreatedMembershipApplicationRow | null;
  const application = row ? membershipApplicationFromRow(row) : null;
  return application
    ? { application, error: null }
    : { application: null, error: "ระบบไม่ได้ส่งข้อมูลใบสมัครกลับมา กรุณาลองอีกครั้ง" };
}

export async function recordMembershipLineSlipReceived(
  supabase: SupabaseClient,
  requestId: string,
): Promise<MembershipApplicationMutationResult> {
  return mutateMembershipApplication(
    supabase,
    "record_membership_line_slip_received",
    requestId,
    "record membership LINE slip receipt",
    fetchMembershipLineSlipWorkflowReadiness,
    MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
  );
}

export async function convertFounderApplicationToTeacher(
  supabase: SupabaseClient,
  requestId: string,
): Promise<MembershipApplicationMutationResult> {
  return mutateMembershipApplication(
    supabase,
    "convert_founder_application_to_teacher",
    requestId,
    "convert Founder application to Teacher",
  );
}

export async function confirmMembershipPayment(
  supabase: SupabaseClient,
  requestId: string,
  confirmation: ManualPaymentConfirmation,
): Promise<string | null> {
  if (await fetchMembershipSchemaReadiness(supabase) !== "ready") {
    return MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE;
  }

  const outcome = await withTimeout(Promise.resolve(supabase.rpc("confirm_membership_payment", {
    p_request_id: requestId,
    p_amount_thb: confirmation.amountThb,
    p_payment_reference: confirmation.paymentReference.trim(),
    p_paid_at: confirmation.paidAt,
    p_idempotency_key: confirmation.idempotencyKey,
  })), "confirm membership payment");
  if (!outcome.ok) return outcome.reason;
  const { error } = outcome.value;
  if (error) {
    logError("confirmMembershipPayment failed", error);
    return error.message;
  }
  return null;
}

export async function confirmSubscriptionRenewal(
  supabase: SupabaseClient,
  subscriptionId: string,
  confirmation: ManualPaymentConfirmation,
): Promise<string | null> {
  if (await fetchMembershipSchemaReadiness(supabase) !== "ready") {
    return MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE;
  }

  const outcome = await withTimeout(Promise.resolve(supabase.rpc("confirm_subscription_renewal", {
    p_subscription_id: subscriptionId,
    p_amount_thb: confirmation.amountThb,
    p_payment_reference: confirmation.paymentReference.trim(),
    p_paid_at: confirmation.paidAt,
    p_idempotency_key: confirmation.idempotencyKey,
  })), "confirm subscription renewal");
  if (!outcome.ok) return outcome.reason;
  const { error } = outcome.value;
  if (error) {
    logError("confirmSubscriptionRenewal failed", error);
    return error.message;
  }
  return null;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, plan, avatar_path")
    .eq("id", userId)
    .single();

  if (error) logError("fetchProfile failed", error);
  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    plan: data.plan,
    avatarPath: data.avatar_path,
  };
}

export interface ResourceReview {
  id: string;
  resourceId: string;
  rating: number;
  body: string;
  reviewerName: string;
  reviewerAvatarPath: string | null;
  updatedAt: string;
}

export interface MyResourceReview {
  rating: number;
  body: string;
}

export type ResourceIssueCategory =
  | "cannot_open"
  | "broken_link"
  | "cannot_download"
  | "wrong_content"
  | "other";

export async function fetchResourceReviews(supabase: SupabaseClient, resourceId: string): Promise<ResourceReview[]> {
  const { data, error } = await supabase
    .from("resource_review_feed")
    .select("id, resource_id, rating, body, reviewer_name, reviewer_avatar_path, updated_at")
    .eq("resource_id", resourceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) logError("fetchResourceReviews failed", error);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    resourceId: row.resource_id,
    rating: Number(row.rating),
    body: row.body,
    reviewerName: row.reviewer_name,
    reviewerAvatarPath: row.reviewer_avatar_path,
    updatedAt: row.updated_at,
  }));
}

/**
 * Reads only the caller's own editable review through a narrow RPC. The
 * public feed intentionally omits ownership data, while client code must not
 * query the underlying moderation table directly.
 */
export async function fetchMyResourceReview(
  supabase: SupabaseClient,
  resourceId: string,
): Promise<MyResourceReview | null> {
  const { data, error } = await supabase.rpc("get_my_resource_review", {
    p_resource_id: resourceId,
  });
  if (error) {
    logError("fetchMyResourceReview failed", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const rating = Number((row as { rating?: unknown }).rating);
  const body = (row as { body?: unknown }).body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof body !== "string") return null;
  return { rating, body };
}

export async function upsertMyResourceReview(
  supabase: SupabaseClient,
  resourceId: string,
  rating: number,
  body: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("upsert_my_resource_review", {
    p_resource_id: resourceId,
    p_rating: rating,
    p_body: body.trim(),
  });
  if (error) {
    logError("upsertMyResourceReview failed", error);
    return friendlyErrorMessage(error, "บันทึกรีวิวไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return null;
}

export async function deleteMyResourceReview(supabase: SupabaseClient, resourceId: string): Promise<string | null> {
  const { error } = await supabase.rpc("delete_my_resource_review", { p_resource_id: resourceId });
  if (error) {
    logError("deleteMyResourceReview failed", error);
    return friendlyErrorMessage(error, "ลบรีวิวไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return null;
}

export async function submitResourceIssue(
  supabase: SupabaseClient,
  resourceId: string,
  category: ResourceIssueCategory,
  details: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("submit_resource_issue", {
    p_resource_id: resourceId,
    p_category: category,
    p_details: details.trim(),
  });
  if (error) {
    logError("submitResourceIssue failed", error);
    return friendlyErrorMessage(error, "ส่งรายงานปัญหาไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return null;
}

export async function updateMyDisplayName(
  supabase: SupabaseClient,
  fullName: string,
): Promise<string | null> {
  const outcome = await withTimeout(Promise.resolve().then(() => supabase.rpc("update_my_display_name", {
    p_full_name: fullName.trim(),
  })), "profile display-name update");
  if (!outcome.ok) {
    console.error(`updateMyDisplayName failed: ${outcome.reason}`);
    return "บันทึกชื่อที่แสดงไม่สำเร็จ กรุณาลองอีกครั้ง";
  }
  const { error } = outcome.value;
  if (error) {
    logError("updateMyDisplayName failed", error);
    return friendlyErrorMessage(error, "บันทึกชื่อที่แสดงไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return null;
}
