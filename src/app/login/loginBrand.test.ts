import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("login and signup branding", () => {
  it("links both signed-out logos to the public home page", () => {
    expect(loginSource.match(/<BrandLogo href="\/"/g)).toHaveLength(2);
    expect(loginSource).toContain("mascotSize={104}");
    expect(loginSource).toContain("mascotSize={64}");
  });

  it("keeps a visible mobile logo and swaps to the larger brand panel on desktop", () => {
    expect(loginSource).toContain(".kru-login-form-brand { margin: 0 auto var(--sp-7); }");
    expect(loginSource).toContain(".kru-login-form-brand { display: none; }");
    expect(loginSource).toContain(".kru-login-brand { display: flex !important; }");
  });

  it("uses separate canonical signup and allowlisted sign-in destinations", () => {
    expect(loginSource).toContain("authCompletionDestination(requestedMode, rawNext)");
    expect(loginSource).toContain('authCompletionDestination("signin", rawNext)');
    expect(loginSource).toContain("buildSignupConfirmationRedirect(window.location.origin)");
    expect(loginSource).toContain("router.replace(SIGNUP_DESTINATION)");
    expect(loginSource).toContain("router.replace(signInDestination)");
  });

  it("redirects only a verified permanent user away from login", () => {
    expect(loginSource).toContain("!authError && isPermanentAuthUser(user)");
    expect(loginSource).not.toContain("if (user) router.replace(authenticatedDestination)");
  });
});
