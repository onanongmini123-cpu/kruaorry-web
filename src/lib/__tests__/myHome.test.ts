import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MyHome, MyHomeSkeleton } from "@/app/landing/MyHome";
import type { ViewerSummary } from "@/app/landing/useViewerSummary";
import type { Resource } from "@/lib/data";
import {
  addRecentId, formatThaiDay, greetingText, isNewSince, parseRecentIds, readRecentIds, recordRecentResource, RECENT_LIMIT,
  summarizeViewer, teacherFirstName, visitBaseline,
} from "@/lib/myHome";
import type { MemberSubscription } from "@/lib/memberAccount";

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("greeting", () => {
  it("uses the first name, never doubles ครู, and never falls back to the e-mail address", () => {
    expect(teacherFirstName("นภา ใจดี")).toBe("นภา");
    expect(teacherFirstName("ครูนภา")).toBe("นภา");
    expect(teacherFirstName("  ")).toBeNull();
    expect(teacherFirstName(null)).toBeNull();
    expect(greetingText("นภา ใจดี")).toBe("สวัสดีค่ะ ครูนภา 👋");
    expect(greetingText("ครู")).toBe("สวัสดีค่ะ คุณครู 👋");
    expect(greetingText(undefined)).toBe("สวัสดีค่ะ คุณครู 👋");
  });
});

describe("recently used", () => {
  it("keeps newest first, no duplicates, at most 8, and ignores bad stored data", () => {
    let list: string[] = [];
    for (let n = 1; n <= 10; n += 1) list = addRecentId(list, uuid(n));
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]).toBe(uuid(10));
    expect(addRecentId(list, uuid(5))[0]).toBe(uuid(5));
    expect(addRecentId(list, uuid(5)).filter((id) => id === uuid(5))).toHaveLength(1);
    expect(addRecentId(["x"] as string[], "not-an-id")).toEqual(["x"]);
    expect(parseRecentIds(JSON.stringify([uuid(1), "junk", 5, uuid(1), uuid(2)]))).toEqual([uuid(1), uuid(2)]);
    for (const bad of [null, "", "{", "{}", "5"]) expect(parseRecentIds(bad)).toEqual([]);
  });
});

describe("browser storage (per member, never the database)", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() };
  };
  let local: ReturnType<typeof memory>; let session: ReturnType<typeof memory>;
  beforeEach(() => {
    local = memory(); session = memory();
    (globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: session };
  });
  afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

  it("recent lists are separate per member", () => {
    recordRecentResource("u1", uuid(1)); recordRecentResource("u1", uuid(2)); recordRecentResource("u2", uuid(3));
    expect(readRecentIds("u1")).toEqual([uuid(2), uuid(1)]);
    expect(readRecentIds("u2")).toEqual([uuid(3)]);
    expect(readRecentIds("nobody")).toEqual([]);
  });

  it("the previous visit is remembered for this tab, so a reload keeps the 'new' badges", () => {
    expect(visitBaseline("u1", 1000)).toBeNull();            // first visit on this device
    expect(visitBaseline("u1", 5000)).toBeNull();            // same tab: still the same baseline
    session.clear();                                          // a new tab/session later
    expect(visitBaseline("u1", 9000)).toBe(1000);            // baseline = the previous visit (first load of earlier tab wrote 1000)
    expect(visitBaseline("u1", 9500)).toBe(1000);
    expect(visitBaseline("u2", 9500)).toBeNull();            // another member on the same browser starts fresh
  });

  it("never throws when storage is blocked", () => {
    (globalThis as unknown as { window: unknown }).window = { get localStorage() { throw new Error("blocked"); }, get sessionStorage() { throw new Error("blocked"); } };
    expect(readRecentIds("u1")).toEqual([]);
    expect(() => recordRecentResource("u1", uuid(1))).not.toThrow();
    expect(visitBaseline("u1")).toBeNull();
  });

  it("isNewSince: after the last visit, else the normal new-this-week flag on a first visit", () => {
    const t = (iso: string) => Date.parse(iso);
    expect(isNewSince("2026-11-20T00:00:00Z", t("2026-11-10T00:00:00Z"), false)).toBe(true);
    expect(isNewSince("2026-11-05T00:00:00Z", t("2026-11-10T00:00:00Z"), true)).toBe(false);
    expect(isNewSince(null, t("2026-11-10T00:00:00Z"), true)).toBe(false);
    expect(isNewSince("2026-11-05T00:00:00Z", null, true)).toBe(true);
    expect(isNewSince(undefined, null, false)).toBe(false);
  });
});

describe("summarizeViewer", () => {
  const sub = (over: Partial<MemberSubscription> = {}): MemberSubscription => ({ id: "s", planId: "teacher", planName: "Teacher", status: "active", source: "admin", billingInterval: "year", currentPeriodEnd: "2999-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", ...over });
  it("free member", () => {
    expect(summarizeViewer({ role: "member", entitlements: { planId: "free", features: {} }, subscription: null })).toEqual({ kind: "free", label: "สมาชิกฟรี", until: null });
  });
  it("Pro member shows the plan name and the end date it already has", () => {
    expect(summarizeViewer({ role: "member", entitlements: { planId: "teacher", features: {} }, subscription: sub() })).toEqual({ kind: "pro", label: "Teacher Pro", until: "2999-01-01T00:00:00Z" });
    expect(summarizeViewer({ role: "member", entitlements: { planId: "founder", features: {} }, subscription: null }).label).toBe("Founder 100");
    expect(summarizeViewer({ role: "member", entitlements: { planId: "teacher", features: {} }, subscription: null }).until).toBeNull();
  });
  it("admin and owner are admins whatever their plan", () => {
    for (const role of ["admin", "owner"]) expect(summarizeViewer({ role, entitlements: { planId: "free", features: {} }, subscription: null }).kind).toBe("admin");
  });
  it("formats a Thai date, or nothing", () => {
    expect(formatThaiDay("2027-03-05T00:00:00Z")).toContain("2570");
    expect(formatThaiDay(null)).toBeNull();
    expect(formatThaiDay("nope")).toBeNull();
  });
});

describe("MyHome view", () => {
  const resource = (n: number): Resource => ({
    id: uuid(n), slug: `r-${n}`, title: `สื่อ ${n}`, meta: "", description: "d", category: null, affordance: "web_app", coverImageUrl: null, tags: [], gradeLevels: [],
    accessMode: "public", requiredPlanIds: [], requiredPlanNames: [], free: true, isNew: false, publishedAt: "2026-11-20T00:00:00Z", fileSize: null, featuredRank: null, reviewAverage: null, reviewCount: 0,
  });
  const base: ViewerSummary = { status: "ready", userId: "u1", fullName: "นภา ใจดี", kind: "free", label: "สมาชิกฟรี", until: null, savedIds: [] };
  const render = (summary: Partial<ViewerSummary>, resources = [1, 2, 3].map(resource)) =>
    renderToStaticMarkup(React.createElement(MyHome, { summary: { ...base, ...summary }, resources, baseline: Date.parse("2026-11-10T00:00:00Z") }));

  it("free member: greeting, badge, a polite upgrade button, four shortcuts, and the favourites invitation", () => {
    const html = render({});
    expect(html).toContain("สวัสดีค่ะ ครูนภา 👋");
    expect(html).toContain("สมาชิกฟรี");
    expect(html).toContain("อัปเกรดเป็น Teacher Pro");
    expect(html).toContain('href="/membership"');
    for (const label of ["คลังสื่อทั้งหมด", "เกม", "รายการโปรด", "บัญชีของฉัน"]) expect(html).toContain(label);
    expect(html).toContain("กด ❤️ ที่สื่อที่ชอบ แล้วจะมาอยู่ตรงนี้ค่ะ");
    expect(html).not.toContain("หลังบ้าน");
  });
  it("Pro member: plan badge and the end date, no upgrade button", () => {
    const html = render({ kind: "pro", label: "Teacher Pro", until: "2027-03-05T00:00:00Z" });
    expect(html).toContain("Teacher Pro");
    expect(html).toContain("ใช้ได้ถึง");
    expect(html).not.toContain("อัปเกรดเป็น Teacher Pro");
    expect(html).not.toContain("หลังบ้าน");
  });
  it("admin: shortcut to the back office", () => {
    const html = render({ kind: "admin", label: "แอดมิน" });
    expect(html).toContain("หลังบ้าน");
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain("อัปเกรดเป็น Teacher Pro");
  });
  it("hearts show up as cards in the favourites row, and unknown ids are skipped", () => {
    const html = render({ savedIds: [uuid(2), uuid(99), uuid(1)] });
    expect(html).not.toContain("กด ❤️ ที่สื่อที่ชอบ");
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html.indexOf("สื่อ 2")).toBeLessThan(html.indexOf("สื่อ 1"));
    expect(html).toContain("ดูทั้งหมด");
  });
  it("shows 'ใหม่' only for resources published after the last visit", () => {
    const old = { ...resource(1), publishedAt: "2026-11-01T00:00:00Z", isNew: true };
    const fresh = { ...resource(2), publishedAt: "2026-11-20T00:00:00Z", isNew: false };
    const html = render({ savedIds: [old.id, fresh.id] }, [old, fresh]);
    expect(html.match(/>ใหม่</g)).toHaveLength(1);
    expect(html.indexOf("สื่อ 2")).toBeLessThan(html.indexOf(">ใหม่<"));
  });
  it("the plan unknown (read failed): greeting only, no upgrade button and no guessed badge", () => {
    const html = render({ status: "error", kind: null, label: null });
    expect(html).toContain("สวัสดีค่ะ");
    expect(html).not.toContain("อัปเกรดเป็น Teacher Pro");
    expect(html).not.toContain("สมาชิกฟรี");
  });
  it("skeleton announces itself politely and has no content", () => {
    const html = renderToStaticMarkup(React.createElement(MyHomeSkeleton));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("กำลังเตรียมส่วนของคุณครู");
  });
});

describe("wiring on the homepage (cached page stays the same for everyone)", () => {
  it("the page itself stays static/revalidated, and the member data is fetched in the browser", () => {
    const page = read("src/app/page.tsx");
    expect(page).toContain("export const revalidate = 300");
    expect(page).not.toMatch(/export const dynamic|cookies\(|headers\(/);
    const hook = read("src/app/landing/useViewerSummary.ts");
    expect(hook.startsWith('"use client"')).toBe(true);
    expect(hook).toContain("fetchSavedResourceIds");
    expect(read("src/lib/myHome.ts")).not.toMatch(/\.rpc\(|\.from\(/);
  });
  it("free members are invited to upgrade; Pro and admins see no sign-up or upgrade buttons in the old sections", () => {
    const source = read("src/app/landing/LandingExperience.tsx");
    expect(source).toContain('const hideAccountCta = isMember && (viewer.kind === "pro" || viewer.kind === "admin")');
    expect(source).toContain('label: "อัปเกรดเป็น Teacher Pro"');
    expect(source).toContain("hideFreeAction={hideAccountCta}");
    expect(source).toContain("compactHero");
  });
  it("opening a resource page remembers it for this member in this browser only", () => {
    expect(read("src/components/RecentViewTracker.tsx")).toContain("recordRecentResource");
    expect(read("src/app/resources/[key]/page.tsx")).toContain("<RecentViewTracker resourceId={item.id} />");
    expect(read("src/app/app/page.tsx")).toContain("recordRecentResource(profile.id, r.id)");
  });
});
