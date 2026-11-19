import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/membershipSchemaReadiness", () => ({ fetchMembershipSchemaReadiness: vi.fn(async () => "ready") }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

const applicationId = "11111111-2222-4333-8444-555555555555";
const url = (id = applicationId) => new Request(`https://kruaorry.example/api/membership/promptpay?request=${id}`);

function fakeClient(options: { user: boolean; row: unknown }) {
  const eq = vi.fn();
  const query = { eq, maybeSingle: async () => ({ data: options.row, error: null }) };
  eq.mockReturnValue(query);
  return {
    client: {
      auth: { getUser: async () => ({ data: { user: options.user ? { id: "u1", is_anonymous: false, email: "teacher@example.com", app_metadata: { provider: "email" } } : null }, error: null }) },
      from: vi.fn(() => ({ select: vi.fn(() => query) })),
    },
    eq,
  };
}

beforeEach(() => {
  process.env.PROMPTPAY_ID = "0812345678";
  process.env.PROMPTPAY_ACCOUNT_NAME = "ทดสอบ ระบบ";
});
afterEach(() => {
  delete process.env.PROMPTPAY_ID;
  delete process.env.PROMPTPAY_ACCOUNT_NAME;
  vi.restoreAllMocks();
});

describe("PromptPay QR route", () => {
  it("rejects a malformed application id before touching the database", async () => {
    const response = await GET(url("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports not_configured without revealing anything when the env placeholders are empty", async () => {
    delete process.env.PROMPTPAY_ID;
    const response = await GET(url());
    expect(await response.json()).toEqual({ status: "not_configured" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("never reveals the account to a signed-out visitor", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeClient({ user: false, row: null }).client as never);
    const response = await GET(url());
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("ทดสอบ");
  });

  it("looks the application up by id AND the caller's own user id, and 404s when it is not theirs or not pending", async () => {
    const { client, eq } = fakeClient({ user: true, row: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(url());
    expect(response.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("id", applicationId);
    expect(eq).toHaveBeenCalledWith("user_id", "u1");

    const resolved = fakeClient({ user: true, row: { reference_code: "KA-1", status: "approved", quoted_amount_thb: 599 } });
    vi.mocked(createClient).mockResolvedValue(resolved.client as never);
    expect((await GET(url())).status).toBe(404);
  });

  it("returns a QR for the server-quoted amount of the caller's own pending application", async () => {
    const { client } = fakeClient({ user: true, row: { reference_code: "KA-00000005", status: "pending", quoted_amount_thb: 299 } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(url());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({ status: "ready", amountThb: 299, accountName: "ทดสอบ ระบบ", referenceCode: "KA-00000005" });
    expect(body.qrSvg.startsWith("<svg")).toBe(true);
  });
});
