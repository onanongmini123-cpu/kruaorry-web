import { effectiveMemberPlan, type AdminSubscription } from "@/lib/adminMembership";

export type AdminMemberRole = "member" | "admin" | "owner";

export interface AdminMemberListItem {
  id: string;
  full_name: string | null;
  email: string;
  plan: string;
  role: AdminMemberRole;
  created_at: string;
}

export type MemberFilter = "all" | "premium" | "expiring" | "free" | "staff";
export type MemberSort = "newest" | "expiring" | "name";

export const MEMBER_FILTER_LABEL: Record<MemberFilter, string> = {
  all: "ทั้งหมด",
  premium: "Pro ที่ใช้งานอยู่",
  expiring: "ใกล้หมดอายุ",
  free: "ฟรี",
  staff: "ทีมงาน",
};

export const MEMBER_FILTER_ORDER: readonly MemberFilter[] = ["all", "premium", "expiring", "free", "staff"];

export const MEMBER_SORT_OPTIONS: ReadonlyArray<{ value: MemberSort; label: string }> = [
  { value: "newest", label: "สมัครล่าสุด" },
  { value: "expiring", label: "ใกล้หมดอายุก่อน" },
  { value: "name", label: "ชื่อ ก–ฮ" },
];

const DAY_MS = 86_400_000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const thaiCollator = new Intl.Collator("th", { sensitivity: "base", numeric: true });

export function normalizeMemberSearch(text: string | null | undefined): string {
  return (text ?? "").toLocaleLowerCase("th-TH").replace(/\s+/g, " ").trim();
}

export function matchesMemberQuery(member: AdminMemberListItem, query: string): boolean {
  const needle = normalizeMemberSearch(query);
  if (!needle) return true;
  const haystack = normalizeMemberSearch(`${member.full_name ?? ""} ${member.email}`);
  return needle.split(" ").every((word) => haystack.includes(word));
}

export function isStaffMember(member: AdminMemberListItem): boolean {
  return member.role === "admin" || member.role === "owner";
}

export function isActivePremiumSubscription(
  subscription: AdminSubscription | null,
  premiumPlanIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (!subscription || !premiumPlanIds.has(subscription.plan_id)) return false;
  return effectiveMemberPlan(subscription, now) === subscription.plan_id;
}

export function isExpiringWithinThirtyDays(
  subscription: AdminSubscription | null,
  premiumPlanIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (!isActivePremiumSubscription(subscription, premiumPlanIds, now) || !subscription?.current_period_end) return false;
  const end = Date.parse(subscription.current_period_end);
  return Number.isFinite(end) && end > now && end <= now + THIRTY_DAYS_MS;
}

function belongsToFilter(
  member: AdminMemberListItem,
  subscription: AdminSubscription | null,
  premiumPlanIds: ReadonlySet<string>,
  filter: MemberFilter,
  now: number,
): boolean {
  if (filter === "staff") return isStaffMember(member);
  if (isStaffMember(member)) return false;
  if (filter === "all") return true;
  const premium = isActivePremiumSubscription(subscription, premiumPlanIds, now);
  if (filter === "premium") return premium;
  if (filter === "expiring") return isExpiringWithinThirtyDays(subscription, premiumPlanIds, now);
  return !premium;
}

export function memberFilterCounts(
  members: readonly AdminMemberListItem[],
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>,
  premiumPlanIds: ReadonlySet<string>,
  now = Date.now(),
): Record<MemberFilter, number> {
  const counts: Record<MemberFilter, number> = { all: 0, premium: 0, expiring: 0, free: 0, staff: 0 };
  for (const member of members) {
    const subscription = subscriptionsByUser.get(member.id) ?? null;
    if (isStaffMember(member)) {
      counts.staff += 1;
      continue;
    }
    counts.all += 1;
    if (isActivePremiumSubscription(subscription, premiumPlanIds, now)) counts.premium += 1;
    else counts.free += 1;
    if (isExpiringWithinThirtyDays(subscription, premiumPlanIds, now)) counts.expiring += 1;
  }
  return counts;
}

function parsedTimestamp(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function memberName(member: AdminMemberListItem): string {
  return normalizeMemberSearch(member.full_name || member.email);
}

export function sortMembers(
  members: readonly AdminMemberListItem[],
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>,
  sort: MemberSort,
  now = Date.now(),
): AdminMemberListItem[] {
  return [...members].sort((left, right) => {
    if (sort === "name") {
      const nameOrder = thaiCollator.compare(memberName(left), memberName(right));
      if (nameOrder !== 0) return nameOrder;
    } else if (sort === "expiring") {
      const leftSubscription = subscriptionsByUser.get(left.id);
      const rightSubscription = subscriptionsByUser.get(right.id);
      const leftEnd = leftSubscription?.current_period_end
        && parsedTimestamp(leftSubscription.current_period_end, Number.POSITIVE_INFINITY) > now
        ? parsedTimestamp(leftSubscription.current_period_end, Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const rightEnd = rightSubscription?.current_period_end
        && parsedTimestamp(rightSubscription.current_period_end, Number.POSITIVE_INFINITY) > now
        ? parsedTimestamp(rightSubscription.current_period_end, Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;
    }

    const leftCreated = parsedTimestamp(left.created_at, Number.NEGATIVE_INFINITY);
    const rightCreated = parsedTimestamp(right.created_at, Number.NEGATIVE_INFINITY);
    if (leftCreated !== rightCreated) return rightCreated > leftCreated ? 1 : -1;
    return left.id.localeCompare(right.id);
  });
}

export function filterAndSortMembers(
  members: readonly AdminMemberListItem[],
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>,
  premiumPlanIds: ReadonlySet<string>,
  { filter = "all", query = "", sort = "newest", now = Date.now() }: {
    filter?: MemberFilter;
    query?: string;
    sort?: MemberSort;
    now?: number;
  } = {},
): AdminMemberListItem[] {
  const filtered = members.filter((member) => belongsToFilter(
    member,
    subscriptionsByUser.get(member.id) ?? null,
    premiumPlanIds,
    filter,
    now,
  ) && matchesMemberQuery(member, query));
  return sortMembers(filtered, subscriptionsByUser, sort, now);
}
