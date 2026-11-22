import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a), revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

let user: { id: string; is_anonymous?: boolean } | null = null;
let role: string | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
  }),
}));

import { POST } from "../route";

const req = (origin: string | null = "https://site.test") =>
  new Request("https://site.test/api/admin/refresh-public", { method: "POST", headers: { host: "site.test", ...(origin ? { origin } : {}) } });

describe("POST /api/admin/refresh-public", () => {
  beforeEach(() => { revalidateTag.mockClear(); revalidatePath.mockClear(); user = null; role = null; });

  it("refuses a request from another site", async () => {
    user = { id: "u1" }; role = "admin";
    expect((await POST(req("https://evil.test"))).status).toBe(403);
    expect((await POST(req(null))).status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses visitors and ordinary members", async () => {
    expect((await POST(req())).status).toBe(401);
    user = { id: "u1" }; role = "member";
    expect((await POST(req())).status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an admin clear the landing and catalog caches and the public pages", async () => {
    user = { id: "u1" }; role = "admin";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("landing", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("catalog", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/resources");
    expect(revalidatePath).toHaveBeenCalledWith("/resources/[key]", "page");
  });

  it("the cached readers carry the tags this route clears", () => {
    const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(read("src/lib/landingData.ts")).toContain('tags: ["landing"]');
    expect(read("src/app/resources/data.ts")).toContain('tags: ["catalog"]');
  });

  it("every admin save of public content asks for a refresh", () => {
    const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    for (const f of ["src/app/admin/AdminHomepageVideosPanel.tsx", "src/app/admin/AdminResourcePreviewsField.tsx", "src/app/admin/page.tsx"]) {
      expect(read(f), f).toContain("refreshPublicPages()");
    }
  });
});
