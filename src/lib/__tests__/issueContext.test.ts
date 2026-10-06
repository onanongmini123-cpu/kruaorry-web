import { describe, expect, it } from "vitest";
import { buildIssueContext, parseBrowser, parseOs } from "../issueContext";
import { BASE_ISSUE_OPTIONS, EXTENDED_ISSUE_OPTIONS, ISSUE_CATEGORY_LABELS, issueOptions } from "../resourceIssues";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const WINDOWS_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87";
const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1";

describe("issue context", () => {
  it("reduces a user agent to browser family + major version and OS family", () => {
    expect(parseBrowser(ANDROID_CHROME)).toBe("Chrome 126");
    expect(parseOs(ANDROID_CHROME)).toBe("Android");
    expect(parseBrowser(IPHONE_SAFARI)).toBe("Safari 17");
    expect(parseOs(IPHONE_SAFARI)).toBe("iOS");
    expect(parseBrowser(WINDOWS_EDGE)).toBe("Edge 126");
    expect(parseOs(WINDOWS_EDGE)).toBe("Windows");
    expect(parseBrowser(MAC_FIREFOX)).toBe("Firefox 127");
    expect(parseOs(MAC_FIREFOX)).toBe("macOS");
    expect(parseBrowser(IPHONE_CHROME)).toBe("Chrome 126");
  });

  it("never contains the raw user agent, device model or minor versions", () => {
    const context = buildIssueContext({ userAgent: ANDROID_CHROME, width: 390.4, height: 844 });
    expect(context).toMatchObject({ browser: "Chrome 126", os: "Android", viewport: "390x844" });
    const text = JSON.stringify(context);
    expect(text).not.toMatch(/SM-S911B|Mozilla|537\.36|6478|Linux/);
  });

  it("always carries the app version and tolerates an unknown browser", () => {
    const context = buildIssueContext({});
    expect(typeof context.app_version).toBe("string");
    expect(context.app_version.length).toBeGreaterThan(0);
    expect(context.browser).toBeUndefined();
    expect(context.viewport).toBeUndefined();
  });
});

describe("problem categories", () => {
  it("offers the seven requested kinds once the database supports them", () => {
    const labels = issueOptions(true).map((option) => option.label);
    for (const wanted of ["เนื้อหาผิด", "เฉลยผิด", "เล่นไม่ได้", "เสียงไม่ออก", "กล้องไม่ทำงาน", "มือถือแสดงผลผิด", "อื่น ๆ"]) {
      expect(labels).toContain(wanted);
    }
  });

  it("offers only categories an older database accepts until then", () => {
    expect(issueOptions(false)).toBe(BASE_ISSUE_OPTIONS);
    expect(BASE_ISSUE_OPTIONS.map((option) => option.value).sort()).toEqual(
      ["broken_link", "cannot_download", "cannot_open", "other", "wrong_content"],
    );
  });

  it("has a label for every category, with no duplicates", () => {
    const values = EXTENDED_ISSUE_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(ISSUE_CATEGORY_LABELS[value]).toBeTruthy();
  });
});
