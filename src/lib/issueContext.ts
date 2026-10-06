import { APP_VERSION } from "@/lib/appVersion";

/**
 * What support needs to reproduce a problem, and nothing that identifies a
 * person: the app build, the browser family and major version, the operating
 * system family, and the screen size. The raw user-agent string is never
 * stored or sent.
 */
export interface IssueContext {
  app_version: string;
  browser?: string;
  os?: string;
  viewport?: string;
}

export function parseBrowser(userAgent: string): string | undefined {
  const rules: Array<[RegExp, string]> = [
    [/(?:Edg|EdgA|EdgiOS)\/(\d+)/, "Edge"],
    [/(?:OPR|Opera)\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
    [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[^]*Safari/, "Safari"],
  ];
  for (const [pattern, name] of rules) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return undefined;
}

export function parseOs(userAgent: string): string | undefined {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return undefined;
}

export function buildIssueContext(environment: { userAgent?: string; width?: number; height?: number }): IssueContext {
  const userAgent = environment.userAgent ?? "";
  const context: IssueContext = { app_version: APP_VERSION };
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  if (browser) context.browser = browser;
  if (os) context.os = os;
  if (environment.width && environment.height) {
    context.viewport = `${Math.round(environment.width)}x${Math.round(environment.height)}`;
  }
  return context;
}

/** Reads the current browser. Returns only the app version on the server. */
export function collectIssueContext(): IssueContext {
  if (typeof window === "undefined") return { app_version: APP_VERSION };
  return buildIssueContext({
    userAgent: window.navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
  });
}
