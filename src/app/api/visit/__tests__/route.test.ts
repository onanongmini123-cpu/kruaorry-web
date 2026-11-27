import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: unknown; error: unknown };
const rpc = vi.fn<(fn: string, args: Record<string, string>) => Promise<RpcResult>>(async () => ({ data: true, error: null }));
const createServiceClient = vi.fn<(url: string, key: string, options: unknown) => { rpc: typeof rpc }>(() => ({ rpc }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (url: string, key: string, options: unknown) => createServiceClient(url, key, options) }));

let user: { id: string; is_anonymous?: boolean } | null = null;
let role: string | null = null;
let authFails = false;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => (authFails ? { data: { user: null }, error: new Error("down") } : { data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
  }),
}));

import { POST } from "../route";
import { bangkokDate, isLikelyBot, viewerDayKey } from "@/lib/siteVisit";

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SESSION = "sb-abc-auth-token=xyz";
const req = ({ ua = BROWSER, origin = "https://site.test", cookie = "", headers = {} }: { ua?: string; origin?: string | null; cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest("https://site.test/api/visit", {
    method: "POST",
    headers: { host: "site.test", "user-agent": ua, "x-forwarded-for": "203.0.113.7", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...headers },
  });

describe("POST /api/visit", () => {
  beforeEach(() => {
    rpc.mockClear(); createServiceClient.mockClear();
    user = null; role = null; authFails = false;
    vi.stubEnv("VISIT_HASH_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("records a visitor once with only a 64-hex daily key, sets the cookie, answers 204 with no body", async () => {
    const res = await POST(req());
    expect(res.status).toBe(204);
    expect(res.headers.get("x-visit-accepted")).toBe("1");
    expect(await res.text()).toBe("");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, string>];
    expect(fn).toBe("record_site_visit");
    expect(Object.keys(args)).toEqual(["p_viewer_day_key"]);
    expect(args.p_viewer_day_key).toMatch(/^[0-9a-f]{64}$/);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/kru_vid=[0-9a-f]{32}/);
    expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/Secure/i); expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=31536000/);
    // No personal data reaches the database call.
    const sent = JSON.stringify(rpc.mock.calls);
    for (const pii of ["203.0.113.7", "iPhone", "Safari", cookie.match(/kru_vid=([0-9a-f]+)/)![1]]) expect(sent).not.toContain(pii);
    // The service client is created with the server-only key and no session storage.
    expect(createServiceClient.mock.calls[0][1]).toBe("service-key");
  });

  it("reuses an existing cookie: same key for the same day, no new cookie", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    const res = await POST(req({ cookie: `kru_vid=${id}` }));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((rpc.mock.calls[0] as [string, Record<string, string>])[1].p_viewer_day_key).toBe(viewerDayKey("test-secret", id, bangkokDate()));
    // A malformed cookie is replaced with a fresh id.
    const res2 = await POST(req({ cookie: "kru_vid=not-an-id" }));
    expect(res2.headers.get("set-cookie")).toMatch(/kru_vid=[0-9a-f]{32}/);
  });

  it("does not count bots, link previews, prefetches or empty user agents", async () => {
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 HeadlessChrome/120", "curl/8.4.0", "python-requests/2.31", "Line-Poker/1.0 preview", ""]) {
      expect((await POST(req({ ua }))).status).toBe(204);
    }
    await POST(req({ headers: { "sec-purpose": "prefetch" } }));
    expect(rpc).not.toHaveBeenCalled();
    expect(isLikelyBot(BROWSER)).toBe(false);
  });

  it("does not count admins or the owner; members and anonymous sessions are counted", async () => {
    for (const staff of ["admin", "owner"]) {
      user = { id: "u1" }; role = staff;
      const res = await POST(req({ cookie: SESSION }));
      expect(res.status).toBe(204);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("x-visit-accepted")).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
    user = { id: "u2" }; role = "member";
    await POST(req({ cookie: SESSION }));
    user = { id: "u3", is_anonymous: true }; role = null;
    await POST(req({ cookie: SESSION }));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not count when the session cannot be checked (staff never slip in)", async () => {
    authFails = true;
    await POST(req({ cookie: SESSION }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not count a signed-in user whose profile role is missing or unfamiliar", async () => {
    user = { id: "u4" };
    for (const unknownRole of [null, "future_role"]) {
      role = unknownRole;
      const res = await POST(req({ cookie: SESSION }));
      expect(res.headers.get("x-visit-accepted")).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records nothing without VISIT_HASH_SECRET or the service key, and never errors", async () => {
    vi.stubEnv("VISIT_HASH_SECRET", "");
    expect((await POST(req())).status).toBe(204);
    vi.stubEnv("VISIT_HASH_SECRET", "s"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await POST(req());
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores requests from another site", async () => {
    await POST(req({ origin: "https://evil.test" }));
    await POST(req({ origin: null }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a database failure still answers 204", async () => {
    rpc.mockImplementationOnce(async () => { throw new Error("db down"); });
    const thrown = await POST(req());
    expect(thrown.status).toBe(204);
    expect(thrown.headers.get("x-visit-accepted")).toBeNull();
    expect(thrown.headers.get("set-cookie")).toBeNull();
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "boom" } }));
    const rejected = await POST(req());
    expect(rejected.status).toBe(204);
    expect(rejected.headers.get("x-visit-accepted")).toBeNull();
    expect(rejected.headers.get("set-cookie")).toBeNull();
  });
});

describe("daily key and Thai day", () => {
  it("changes every Thai day and switches at 17:00 UTC", () => {
    expect(bangkokDate(new Date("2026-11-26T16:59:59Z"))).toBe("2026-11-26");
    expect(bangkokDate(new Date("2026-11-26T17:00:00Z"))).toBe("2026-11-27");
    const id = "0123456789abcdef0123456789abcdef";
    expect(viewerDayKey("s", id, "2026-11-26")).not.toBe(viewerDayKey("s", id, "2026-11-27"));
    expect(viewerDayKey("s", id, "2026-11-26")).not.toBe(viewerDayKey("other", id, "2026-11-26"));
  });
});

describe("wiring", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  it("the beacon is in the root layout, outside any page, and remembers the day it sent", () => {
    expect(read("src/app/layout.tsx")).toContain("<SiteVisitBeacon />");
    const beacon = read("src/components/analytics/SiteVisitBeacon.tsx");
    expect(beacon).toContain('"use client"');
    expect(beacon).toContain("useEffect");
    expect(beacon).toContain("localStorage");
    expect(beacon).toContain('response.headers.get("x-visit-accepted")');
    expect(beacon).toContain("Asia/Bangkok");
    expect(beacon).toContain("return null");
  });
  it("the service-role key is used only by this route", () => {
    const route = read("src/app/api/visit/route.ts");
    expect(route).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(route).not.toMatch(/eyJ[a-zA-Z0-9]|sb_secret_/);
    expect(read("src/components/analytics/SiteVisitBeacon.tsx")).not.toMatch(/SERVICE_ROLE|VISIT_HASH_SECRET/);
  });
});
