import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

import { createClient } from "@/lib/supabase/server";
import AdminLayout, { metadata } from "../layout";

function clientFor(options: {
  user: { id: string; is_anonymous?: boolean } | null;
  role?: string | null;
  profileError?: boolean;
  authThrows?: boolean;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (options.authThrows) throw new Error("auth unavailable");
        return { data: { user: options.user }, error: null };
      }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: options.role === undefined ? null : { role: options.role },
            error: options.profileError ? { message: "boom" } : null,
          }),
        }),
      }),
    })),
  };
}

async function render(options: Parameters<typeof clientFor>[0]) {
  vi.mocked(createClient).mockResolvedValue(clientFor(options) as never);
  return AdminLayout({ children: "ADMIN_UI" as never });
}

beforeEach(() => vi.clearAllMocks());

describe("admin server layout", () => {
  it("serves the admin UI to an admin and an owner", async () => {
    await expect(render({ user: { id: "a" }, role: "admin" })).resolves.toBe("ADMIN_UI");
    await expect(render({ user: { id: "o" }, role: "owner" })).resolves.toBe("ADMIN_UI");
  });

  it("sends an ordinary member to the member app", async () => {
    await expect(render({ user: { id: "m" }, role: "member" })).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  it("sends signed-out and anonymous visitors to login", async () => {
    await expect(render({ user: null })).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fadmin");
    await expect(render({ user: { id: "x", is_anonymous: true }, role: "admin" }))
      .rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fadmin");
  });

  it("fails closed when the role cannot be read", async () => {
    await expect(render({ user: { id: "a" }, role: "admin", profileError: true })).rejects.toThrow("NEXT_REDIRECT:/app");
    await expect(render({ user: { id: "a" }, authThrows: true })).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fadmin");
    vi.mocked(createClient).mockRejectedValue(new Error("no env"));
    await expect(AdminLayout({ children: "x" as never })).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  it("is not indexable", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
