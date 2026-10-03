import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { UpgradeRequest } from "@/lib/data";
import { isMembershipRenewalDue } from "@/lib/membershipRenewal";

export type MemberSubscriptionStatus = "active" | "past_due" | "expired" | "cancelled" | "revoked";

export interface MemberSubscription {
  id: string;
  planId: string;
  planName: string | null;
  status: MemberSubscriptionStatus;
  source: "legacy" | "upgrade_request" | "admin" | "renewal";
  billingInterval: "none" | "year" | "one_time";
  currentPeriodEnd: string | null;
  createdAt: string;
}

interface MemberSubscriptionRow {
  id: string;
  plan_id: string;
  status: MemberSubscriptionStatus;
  source: MemberSubscription["source"];
  billing_interval: MemberSubscription["billingInterval"];
  current_period_end: string | null;
  created_at: string;
  plans: { name: string } | null;
}

export interface MemberSubscriptionResult {
  subscription: MemberSubscription | null;
  error: boolean;
}

const STATUS_PRIORITY: Record<MemberSubscriptionStatus, number> = {
  active: 4,
  past_due: 3,
  expired: 2,
  cancelled: 1,
  revoked: 0,
};

function parsedDate(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function preferredMemberSubscription<T extends MemberSubscription>(current: T | undefined, candidate: T): T {
  if (!current) return candidate;
  const statusDifference = STATUS_PRIORITY[candidate.status] - STATUS_PRIORITY[current.status];
  if (statusDifference !== 0) return statusDifference > 0 ? candidate : current;
  const endDifference = parsedDate(candidate.currentPeriodEnd) - parsedDate(current.currentPeriodEnd);
  if (endDifference !== 0) return endDifference > 0 ? candidate : current;
  return parsedDate(candidate.createdAt) > parsedDate(current.createdAt) ? candidate : current;
}

export function membershipDaysRemaining(currentPeriodEnd: string | null, now = Date.now()): number | null {
  const end = parsedDate(currentPeriodEnd);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

export function isMembershipExpired(subscription: MemberSubscription, now = Date.now()): boolean {
  if (["expired", "cancelled", "revoked"].includes(subscription.status)) return true;
  const end = parsedDate(subscription.currentPeriodEnd);
  return Number.isFinite(end) && end <= now;
}

export function canRequestMembershipRenewal(subscription: MemberSubscription | null, now = Date.now()): boolean {
  if (!subscription || subscription.source === "legacy" || subscription.billingInterval !== "year") return false;
  return isMembershipRenewalDue(subscription.status, subscription.currentPeriodEnd, now);
}

export function preferredMembershipApplication(applications: UpgradeRequest[]): UpgradeRequest | null {
  const pending = applications.find((application) => application.status === "pending");
  return pending ?? applications[0] ?? null;
}

function normalizeSubscription(row: MemberSubscriptionRow): MemberSubscription {
  return {
    id: row.id,
    planId: row.plan_id,
    planName: row.plans?.name ?? null,
    status: row.status,
    source: row.source,
    billingInterval: row.billing_interval,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  };
}

function logSubscriptionError(error: PostgrestError): void {
  // Do not echo PostgREST messages: a joined row can contain account data.
  console.error(`fetchMemberSubscription failed (code=${error.code || "unknown"})`);
}

export async function fetchMemberSubscription(supabase: SupabaseClient, userId: string): Promise<MemberSubscriptionResult> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_id, status, source, billing_interval, current_period_end, created_at, plans(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logSubscriptionError(error);
    return { subscription: null, error: true };
  }

  const subscriptions = ((data ?? []) as unknown as MemberSubscriptionRow[]).map(normalizeSubscription);
  return {
    subscription: subscriptions.reduce<MemberSubscription | undefined>(preferredMemberSubscription, undefined) ?? null,
    error: false,
  };
}
