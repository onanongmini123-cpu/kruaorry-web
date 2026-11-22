import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { navigateAfterAuthChange } from "@/lib/authNavigation";

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("navigateAfterAuthChange", () => {
  it("navigates exactly once to a same-site path", () => {
    const replace = vi.fn();
    expect(navigateAfterAuthChange("/admin", { replace })).toBe(true);
    expect(navigateAfterAuthChange("/app?view=library", { replace })).toBe(true);
    expect(replace.mock.calls).toEqual([["/admin"], ["/app?view=library"]]);
  });
  it("refuses anything that is not a same-site path", () => {
    const replace = vi.fn();
    for (const bad of ["https://evil.example", "//evil.example", "evil", "", "/\\evil.example", "javascript:alert(1)"]) {
      expect(navigateAfterAuthChange(bad, { replace }), bad).toBe(false);
    }
    expect(replace).not.toHaveBeenCalled();
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(tsx?)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("no overlapping navigations after an auth change", () => {
  it("no page calls router.push/replace and then router.refresh() right after (the pair that left /admin half-rendered)", () => {
    const offenders = sourceFiles(path.join(process.cwd(), "src")).filter((file) =>
      /router\.(?:push|replace)\([^)]*\);\s*router\.refresh\(\)/.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
  it("login, sign-out (admin and member app) and password reset use the single navigation", () => {
    for (const file of ["src/app/login/page.tsx", "src/app/admin/page.tsx", "src/app/app/page.tsx", "src/app/reset-password/page.tsx"]) {
      expect(read(file), file).toContain("navigateAfterAuthChange(");
    }
    const login = read("src/app/login/page.tsx");
    expect(login).toContain("navigateAfterAuthChange(signInDestination)");
    expect(login).toContain('navigateAfterAuthChange(authCompletionDestination("signup", rawNext))');
  });
  it("sign-out only navigates after the session is really gone", () => {
    const admin = read("src/app/admin/page.tsx");
    const handler = admin.slice(admin.indexOf("const logoutError = await signOutCurrentSession(supabase.auth);"));
    expect(handler.indexOf("if (logoutError)")).toBeLessThan(handler.indexOf('navigateAfterAuthChange("/")'));
  });
});
