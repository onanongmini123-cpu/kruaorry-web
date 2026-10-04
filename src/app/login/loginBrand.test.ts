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
});
