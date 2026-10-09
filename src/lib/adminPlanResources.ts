import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyErrorMessage, GENERIC_LOAD_ERROR } from "@/lib/userMessages";

export const ADMIN_PLAN_RESOURCES_UNAVAILABLE_MESSAGE =
  "ข้อมูลสื่อกับแพ็กจะพร้อมหลังติดตั้งส่วนสรุปข้อมูล โดยแท็บอื่นยังใช้งานได้ตามปกติ";

export interface AdminPlanResourceSummary {
  access_counts: {
    free: number;
    member: number;
    pro: number;
    locked: number;
    total: number;
  };
  plans: Array<{
    plan_id: string;
    plan_name: string;
    resource_count: number;
    latest_resources: string[];
  }>;
  unassigned_plan_resources: {
    count: number;
    resources: string[];
  };
}

export interface AdminPlanResourceLoadResult {
  data: AdminPlanResourceSummary | null;
  message: string | null;
  unavailable: boolean;
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnlyKeys = (value: UnknownRecord, keys: readonly string[]): boolean => (
  Object.keys(value).every((key) => keys.includes(key))
);
const nonnegativeInteger = (value: unknown): number | null => (
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
);
const nonemptyText = (value: unknown): string | null => (
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null
);

function titleList(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const titles = value.map(nonemptyText);
  return titles.every((title): title is string => title !== null) ? titles : null;
}

/** Reject malformed or identity-shaped RPC data instead of inventing business metrics. */
export function normalizeAdminPlanResourceSummary(value: unknown): AdminPlanResourceSummary | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["access_counts", "plans", "unassigned_plan_resources"])) return null;
  const counts = isRecord(value.access_counts) ? value.access_counts : null;
  const unassigned = isRecord(value.unassigned_plan_resources) ? value.unassigned_plan_resources : null;
  if (!counts || !unassigned
    || !hasOnlyKeys(counts, ["free", "member", "pro", "locked", "total"])
    || !hasOnlyKeys(unassigned, ["count", "resources"])
    || !Array.isArray(value.plans)) return null;

  const free = nonnegativeInteger(counts.free);
  const member = nonnegativeInteger(counts.member);
  const pro = nonnegativeInteger(counts.pro);
  const locked = nonnegativeInteger(counts.locked);
  const total = nonnegativeInteger(counts.total);
  const unassignedCount = nonnegativeInteger(unassigned.count);
  const unassignedResources = titleList(unassigned.resources, 10);
  if (free === null || member === null || pro === null || locked === null || total === null
    || total !== free + member + pro + locked
    || unassignedCount === null || unassignedResources === null
    || unassignedResources.length > unassignedCount) return null;

  const seenPlanIds = new Set<string>();
  const plans: AdminPlanResourceSummary["plans"] = [];
  for (const item of value.plans) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["plan_id", "plan_name", "resource_count", "latest_resources"])) return null;
    const planId = nonemptyText(item.plan_id);
    const planName = nonemptyText(item.plan_name);
    const resourceCount = nonnegativeInteger(item.resource_count);
    const latestResources = titleList(item.latest_resources, 5);
    if (!planId || seenPlanIds.has(planId) || !planName || resourceCount === null || !latestResources
      || latestResources.length > resourceCount || resourceCount > pro) return null;
    seenPlanIds.add(planId);
    plans.push({ plan_id: planId, plan_name: planName, resource_count: resourceCount, latest_resources: latestResources });
  }

  return {
    access_counts: { free, member, pro, locked, total },
    plans,
    unassigned_plan_resources: { count: unassignedCount, resources: unassignedResources },
  };
}

function isMissingAdminPlanResourceRpc(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return /^(?:PGRST202|42883)$/.test(code)
    || /get_admin_plan_resource_summary.*(?:schema cache|does not exist|could not find)/i.test(message);
}

export async function fetchAdminPlanResourceSummary(supabase: SupabaseClient): Promise<AdminPlanResourceLoadResult> {
  try {
    const { data, error } = await supabase.rpc("get_admin_plan_resource_summary");
    if (error) {
      if (isMissingAdminPlanResourceRpc(error)) {
        return { data: null, message: ADMIN_PLAN_RESOURCES_UNAVAILABLE_MESSAGE, unavailable: true };
      }
      return { data: null, message: friendlyErrorMessage(error, GENERIC_LOAD_ERROR), unavailable: false };
    }
    const normalized = normalizeAdminPlanResourceSummary(data);
    if (!normalized) return { data: null, message: GENERIC_LOAD_ERROR, unavailable: false };
    return { data: normalized, message: null, unavailable: false };
  } catch (error) {
    return { data: null, message: friendlyErrorMessage(error, GENERIC_LOAD_ERROR), unavailable: false };
  }
}
