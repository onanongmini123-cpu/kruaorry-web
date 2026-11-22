import { describe, expect, it } from "vitest";
import { isBotUserAgent, isPrefetchRequest, isViewerKey, newViewerKey } from "@/lib/viewTracking";

const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("view tracking", () => {
  it("creates random 32-hex viewer keys and accepts only that shape", () => {
    const a = newViewerKey();
    expect(isViewerKey(a)).toBe(true);
    expect(newViewerKey()).not.toBe(a);
    for (const bad of ["", "abc", `${a}0`, a.toUpperCase(), "g".repeat(32), null, undefined, 5]) expect(isViewerKey(bad)).toBe(false);
  });

  it("counts ordinary browsers and skips bots, tools and a missing user agent", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent(SAFARI)).toBe(false);
    for (const bot of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "curl/8.4.0",
      "python-requests/2.31", "Go-http-client/2.0", "Mozilla/5.0 HeadlessChrome/126.0", "Lighthouse", "node-fetch/1.0", "axios/1.6",
      "WhatsApp/2.23", "Line-Poker/1.0", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "", "   ", "x", null, undefined,
    ]) {
      expect(isBotUserAgent(bot), String(bot)).toBe(true);
    }
  });

  it("skips browser prefetch and prerender requests", () => {
    expect(isPrefetchRequest(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(new Headers())).toBe(false);
  });
});
