import { describe, expect, it } from "vitest";
import type { AdminSubscription } from "@/lib/adminMembership";
import {
  filterAndSortMembers,
  isActivePremiumSubscription,
  isExpiringWithinThirtyDays,
  matchesMemberQuery,
  memberFilterCounts,
  roleChangeConfirmationCopy,
  type AdminMemberListItem,
} from "./memberList";

const NOW = Date.parse("2026-10-09T00:00:00.000Z");
const premiumPlans = new Set(["founder", "teacher"]);

const members: AdminMemberListItem[] = [
  { id: "m1", full_name: "ครู กานต์", email: "kan@example.test", plan: "teacher", role: "member", created_at: "2026-10-08T00:00:00Z" },
  { id: "m2", full_name: "ครู บัว", email: "bua@example.test", plan: "founder", role: "member", created_at: "2026-10-09T00:00:00Z" },
  { id: "m3", full_name: null, email: "free@example.test", plan: "free", role: "member", created_at: "2026-10-07T00:00:00Z" },
  { id: "m4", full_name: "ทีม แอดมิน", email: "admin@example.test", plan: "free", role: "admin", created_at: "2026-10-06T00:00:00Z" },
  { id: "m5", full_name: "เจ้าของ ระบบ", email: "owner@example.test", plan: "free", role: "owner", created_at: "2026-10-05T00:00:00Z" },
];

const subscription = (overrides: Partial<AdminSubscription> = {}): AdminSubscription => ({
  id: "s1",
  user_id: "m1",
  plan_id: "teacher",
  status: "active",
  source: "admin",
  billing_interval: "year",
  current_period_end: "2026-10-19T00:00:00.000Z",
  founder_status: null,
  founder_price_lock: false,
  ...overrides,
});

const subscriptions = new Map<string, AdminSubscription>([
  ["m1", subscription()],
  ["m2", subscription({ id: "s2", user_id: "m2", plan_id: "founder", current_period_end: "2026-11-08T00:00:00.000Z" })],
  ["m3", subscription({ id: "s3", user_id: "m3", plan_id: "teacher", status: "expired", current_period_end: "2026-10-08T23:59:59.000Z" })],
]);

describe("member search", () => {
  it("matches partial names and emails without case sensitivity", () => {
    expect(matchesMemberQuery(members[0], "กาน")).toBe(true);
    expect(matchesMemberQuery(members[0], "KAN@EXAMPLE")).toBe(true);
  });

  it("requires every search word to match", () => {
    expect(matchesMemberQuery(members[0], "ครู example")).toBe(true);
    expect(matchesMemberQuery(members[0], "ครู missing")).toBe(false);
  });
});

describe("member filters", () => {
  it("keeps staff out of the default member list", () => {
    expect(filterAndSortMembers(members, subscriptions, premiumPlans).map((member) => member.id)).toEqual(["m2", "m1", "m3"]);
    expect(filterAndSortMembers(members, subscriptions, premiumPlans, { filter: "staff", now: NOW }).map((member) => member.id)).toEqual(["m4", "m5"]);
  });

  it("uses active subscriptions and the premium feature set rather than plan names", () => {
    expect(isActivePremiumSubscription(subscriptions.get("m1") ?? null, premiumPlans, NOW)).toBe(true);
    expect(isActivePremiumSubscription(subscription({ plan_id: "teacher", status: "expired" }), premiumPlans, NOW)).toBe(false);
    expect(isActivePremiumSubscription(subscription({ plan_id: "renamed_pro" }), premiumPlans, NOW)).toBe(false);
    expect(filterAndSortMembers(members, subscriptions, premiumPlans, { filter: "premium", now: NOW }).map((member) => member.id)).toEqual(["m2", "m1"]);
    expect(filterAndSortMembers(members, subscriptions, premiumPlans, { filter: "free", now: NOW }).map((member) => member.id)).toEqual(["m3"]);
  });

  it("counts each summary filter before applying the search query", () => {
    expect(memberFilterCounts(members, subscriptions, premiumPlans, NOW)).toEqual({ all: 3, premium: 2, expiring: 2, free: 1, staff: 2 });
  });

  it("returns an empty result for a query that matches nobody", () => {
    expect(filterAndSortMembers(members, subscriptions, premiumPlans, { query: "ไม่มีชื่อนี้", now: NOW })).toEqual([]);
  });
});

describe("30-day expiry boundary", () => {
  it("includes exactly 30 days and excludes one millisecond later", () => {
    expect(isExpiringWithinThirtyDays(subscription({ current_period_end: "2026-11-08T00:00:00.000Z" }), premiumPlans, NOW)).toBe(true);
    expect(isExpiringWithinThirtyDays(subscription({ current_period_end: "2026-11-08T00:00:00.001Z" }), premiumPlans, NOW)).toBe(false);
  });

  it("does not classify an already-ended or non-premium subscription as expiring", () => {
    expect(isExpiringWithinThirtyDays(subscription({ current_period_end: "2026-10-09T00:00:00.000Z" }), premiumPlans, NOW)).toBe(false);
    expect(isExpiringWithinThirtyDays(subscription({ plan_id: "free" }), premiumPlans, NOW)).toBe(false);
  });
});

describe("member sorting", () => {
  it("sorts by nearest future expiry and leaves no-expiry rows after dated rows", () => {
    const noExpirySubscriptions = new Map(subscriptions);
    noExpirySubscriptions.delete("m3");
    expect(filterAndSortMembers(members, noExpirySubscriptions, premiumPlans, { sort: "expiring", now: NOW }).map((member) => member.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("sorts Thai display names and falls back to email", () => {
    expect(filterAndSortMembers(members, subscriptions, premiumPlans, { sort: "name", now: NOW }).map((member) => member.id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("self role-change confirmation", () => {
  it("keeps the normal confirmation copy for another account", () => {
    expect(roleChangeConfirmationCopy("owner", "member", false)).toEqual({
      confirmLabel: "ยืนยันเปลี่ยนเป็นสมาชิก",
      selfWarnings: [],
    });
  });

  it("warns that an admin changing their own role to member leaves the back office", () => {
    expect(roleChangeConfirmationCopy("admin", "member", true)).toEqual({
      confirmLabel: "ยืนยันและออกจากหลังบ้าน",
      selfWarnings: ["นี่คือบัญชีของคุณเอง — ถ้าลดสิทธิ์เป็นสมาชิก คุณจะออกจากหลังบ้านทันที"],
    });
  });

  it("warns that an owner surrendering ownership loses team-role management", () => {
    expect(roleChangeConfirmationCopy("owner", "admin", true)).toEqual({
      confirmLabel: "ยืนยันสละสิทธิ์เจ้าของระบบ",
      selfWarnings: ["นี่คือบัญชีของคุณเอง — หากสละสิทธิ์เจ้าของระบบ คุณจะไม่สามารถเปลี่ยนบทบาททีมงานได้อีก"],
    });
  });

  it("shows both effects when an owner changes their own role to member", () => {
    const copy = roleChangeConfirmationCopy("owner", "member", true);
    expect(copy.confirmLabel).toBe("ยืนยันและออกจากหลังบ้าน");
    expect(copy.selfWarnings).toEqual([
      "นี่คือบัญชีของคุณเอง — ถ้าลดสิทธิ์เป็นสมาชิก คุณจะออกจากหลังบ้านทันที",
      "นี่คือบัญชีของคุณเอง — หากสละสิทธิ์เจ้าของระบบ คุณจะไม่สามารถเปลี่ยนบทบาททีมงานได้อีก",
    ]);
  });
});
