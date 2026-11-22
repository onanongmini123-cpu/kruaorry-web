import { describe, expect, it } from "vitest";
import {
  authCompletionDestination,
  FREE_SIGNUP_HREF,
  safeAuthNext,
  safeUpgradeReturnPath,
  safeMembershipReturn,
  SIGNUP_DESTINATION,
} from "../authReturnPath";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("safeAuthNext", () => {
  it("accepts the known app and resource destinations", () => {
    expect(safeAuthNext("/app")).toBe("/app");
    expect(safeAuthNext(`/app?resource=${id}`)).toBe(`/app?resource=${id}`);
    expect(safeAuthNext(`/resources/${id}`)).toBe(`/resources/${id}`);
    expect(safeAuthNext(`/download/${id}`)).toBe(`/download/${id}`);
    expect(safeAuthNext(`/download/${id}?name=${encodeURIComponent("ใบงานภาษาไทย.pdf")}&autoclose=1`))
      .toBe(`/download/${id}?name=${encodeURIComponent("ใบงานภาษาไทย.pdf")}&autoclose=1`);
    expect(safeAuthNext("/app?view=favorites")).toBe("/app?view=favorites");
    // The back office is a valid sign-in destination (it checks the role itself).
    expect(safeAuthNext("/admin")).toBe("/admin");
    expect(safeAuthNext("/admin?view=members")).toBe("/admin?view=members");
    expect(safeAuthNext("/admin?view=resources-featured")).toBe("/admin?view=resources-featured");
    expect(safeAuthNext("/membership")).toBe("/membership");
    expect(safeAuthNext("/membership?plan=founder")).toBe("/membership?plan=founder");
    expect(safeAuthNext("/membership?plan=teacher")).toBe("/membership?plan=teacher");
    expect(safeAuthNext(`/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`))
      .toBe(`/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`);
    expect(safeAuthNext("/app?view=library&q=%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B9%84%E0%B8%97%E0%B8%A2&category=%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99&grade=p2"))
      .toBe("/app?view=library&q=%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B9%84%E0%B8%97%E0%B8%A2&category=%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99&grade=p2");
  });

  it.each([
    null,
    "",
    "https://evil.example/app",
    "//evil.example/path",
    "/\\evil.example/path",
    "/auth/callback",
    "/administrator",
    "/admin/",
    "/admin/users",
    "/admin?view=Dash",
    "/admin?view=a&view=b",
    "/admin?view=a&next=https%3A%2F%2Fevil.example",
    "/admin?next=/app",
    "/admin#x",
    "/admin?view=" + "a".repeat(60),
    "/admin?view=../app",
    "//admin",
    "/%2Fadmin",
    "/resources/Not_A_Slug",
    "/resources/ab",
    "/resources/..%2Fadmin",
    "/resources/sentence-train/extra",
    "/resources/sentence-train?next=/admin",
    `/resources/${id}?redirect=https%3A%2F%2Fevil.example`,
    "/download/not-a-uuid",
    `/download/${id}?autoclose=0`,
    `/download/${id}?name=a%2Fb.pdf`,
    `/download/${id}?name=a&name=b`,
    `/app?resource=${id}&redirect=https%3A%2F%2Fevil.example`,
    `/app?resource=bad`,
    "/app?view=admin",
    "/app?view=favorites&view=library",
    "/app?view=library&grade=p2&grade=p3",
    "/app?view=library&grade=%E0%B8%9B.2",
    "/app?view=library&unknown=value",
    "/app#fragment",
    "/membership?redirect=https%3A%2F%2Fevil.example",
    "/membership?plan=free",
    "/membership?plan=founder&plan=teacher",
    `/membership?plan=teacher&returnTo=${encodeURIComponent("https://evil.example")}`,
    `/membership?plan=teacher&returnTo=${encodeURIComponent("//evil.example/path")}`,
    `/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}&returnTo=%2Fapp`,
    "/membership?plan=teacher&redirect=https%3A%2F%2Fevil.example",
    "/membership#how-to-pay",
  ])("falls back to /app for an unsafe destination: %s", (raw) => {
    expect(safeAuthNext(raw)).toBe("/app");
  });
});

describe("authCompletionDestination", () => {
  it("signup completion is /app, except for the membership page the visitor chose a plan on", () => {
    expect(FREE_SIGNUP_HREF).toBe("/login?mode=signup&next=%2Fapp");
    expect(SIGNUP_DESTINATION).toBe("/app");
    expect(authCompletionDestination("signup", "/app")).toBe("/app");
    expect(authCompletionDestination("signup", `/app?resource=${id}`)).toBe("/app");
    expect(authCompletionDestination("signup", "https://evil.example/steal")).toBe("/app");
    expect(authCompletionDestination("signup", `/download/${id}?name=a.pdf`)).toBe("/app");
    expect(authCompletionDestination("signup", "/membership?plan=teacher&returnTo=%2Fapp")).toBe("/membership?plan=teacher&returnTo=%2Fapp");
    expect(authCompletionDestination("signup", "/membership?plan=founder")).toBe("/membership?plan=founder");
    expect(authCompletionDestination("signup", "/membership")).toBe("/membership");
  });

  it("safeMembershipReturn allows only /membership with a plan and a safe returnTo", () => {
    expect(safeMembershipReturn("/membership?plan=teacher&returnTo=%2Fapp")).toBe("/membership?plan=teacher&returnTo=%2Fapp");
    expect(safeMembershipReturn(`/membership?plan=founder&returnTo=${encodeURIComponent(`/resources/${id}`)}`)).toContain("/membership?plan=founder");
    for (const bad of [
      null, undefined, "", "/app", "/membership/", "/membership/extra", "/membershipx", "/membership?plan=admin",
      "/membership?plan=teacher&x=1", "/membership?plan=teacher&plan=founder", "/membership?plan=teacher&returnTo=https%3A%2F%2Fevil.example",
      "/membership?plan=teacher&returnTo=%2F%2Fevil.example", "/membership?plan=teacher&returnTo=%2Fadmin",
      "//evil.example/membership", "https://evil.example/membership", "/\\evil.example", "/membership\n?plan=teacher",
      "/membership#frag", "/membership?plan=teacher#x", "javascript:alert(1)", `/${"a".repeat(800)}`,
    ]) {
      expect(safeMembershipReturn(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });

  it("sign-in keeps its wider allowlist and still sends a bad membership path to /app", () => {
    expect(authCompletionDestination("signin", "/membership?plan=teacher&returnTo=%2Fapp")).toBe("/membership?plan=teacher&returnTo=%2Fapp");
    expect(authCompletionDestination("signin", "/membership?plan=evil")).toBe("/app");
    expect(authCompletionDestination("signin", "/membership?plan=teacher&x=1")).toBe("/app");
  });

  it("preserves only an allowlisted next for sign-in", () => {
    expect(authCompletionDestination("signin", `/resources/${id}`)).toBe(`/resources/${id}`);
    expect(authCompletionDestination("signin", `/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`))
      .toBe(`/membership?plan=teacher&returnTo=${encodeURIComponent(`/resources/${id}`)}`);
    expect(authCompletionDestination("signin", "//evil.example/steal")).toBe("/app");
  });
});

describe("safeUpgradeReturnPath", () => {
  it("accepts only app state and a UUID public-resource detail", () => {
    expect(safeUpgradeReturnPath(`/resources/${id}`)).toBe(`/resources/${id}`);
    expect(safeUpgradeReturnPath(`/app?resource=${id}`)).toBe(`/app?resource=${id}`);
  });

  it.each([
    "https://evil.example/resource",
    "//evil.example/resource",
    "/\\evil.example/resource",
    "/membership?plan=teacher",
    `/download/${id}`,
    `/resources/${id}#payment`,
    `/resources/${id}?next=%2F%2Fevil.example`,
  ])("falls back for an unsafe upgrade return path: %s", (raw) => {
    expect(safeUpgradeReturnPath(raw)).toBe("/app");
  });

  it("keeps a signed-in visitor on a slug address after login or upgrade", () => {
    expect(safeAuthNext("/resources/sentence-train")).toBe("/resources/sentence-train");
    expect(authCompletionDestination("signin", "/resources/grammar-boss-battle")).toBe("/resources/grammar-boss-battle");
    expect(safeUpgradeReturnPath("/resources/sentence-train")).toBe("/resources/sentence-train");
  });
});

describe("the back office is never a sign-up destination", () => {
  it("sign-up always ends at /app or the membership page, whatever next says", () => {
    expect(authCompletionDestination("signup", "/admin")).toBe("/app");
    expect(authCompletionDestination("signup", "/admin?view=members")).toBe("/app");
    expect(authCompletionDestination("signin", "/admin")).toBe("/admin");
  });
});
