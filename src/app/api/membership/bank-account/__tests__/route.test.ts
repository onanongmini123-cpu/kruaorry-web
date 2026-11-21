import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/membershipSchemaReadiness", () => ({ fetchMembershipSchemaReadiness: vi.fn(async () => "ready") }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "../route";

const applicationId = "11111111-2222-4333-8444-555555555555";
const url = (id = applicationId, extra = "") => new Request(`https://kruaorry.example/api/membership/bank-account?request=${id}${extra}`);

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

const ACCOUNT_NUMBER = "123-4-56789-0";

beforeEach(() => {
  process.env.BANK_NAME = "ธนาคารตัวอย่าง";
  process.env.BANK_ACCOUNT_NUMBER = ACCOUNT_NUMBER;
  process.env.BANK_ACCOUNT_NAME = "ทดสอบ ระบบ";
});
afterEach(() => {
  delete process.env.BANK_NAME;
  delete process.env.BANK_ACCOUNT_NUMBER;
  delete process.env.BANK_ACCOUNT_NAME;
  vi.restoreAllMocks();
  vi.mocked(createClient).mockReset();
});

const pending = { reference_code: "KA-00000005", status: "pending", quoted_amount_thb: 299 };

describe("bank account route", () => {
  it("rejects a malformed application id before touching the database", async () => {
    const response = await GET(url("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports not_configured, without a database call, when any of the three values is missing", async () => {
    for (const key of ["BANK_NAME", "BANK_ACCOUNT_NUMBER", "BANK_ACCOUNT_NAME"]) {
      const saved = process.env[key];
      delete process.env[key];
      const response = await GET(url());
      expect(await response.json()).toEqual({ status: "not_configured" });
      process.env[key] = saved;
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("never reveals the account to a signed-out visitor", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeClient({ user: false, row: null }).client as never);
    const response = await GET(url());
    expect(response.status).toBe(401);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain(ACCOUNT_NUMBER);
    expect(text).not.toContain("ทดสอบ");
  });

  it("looks the application up by id AND the caller's own user id, so someone else's application gets nothing", async () => {
    const { client, eq } = fakeClient({ user: true, row: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await GET(url());
    expect(response.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("id", applicationId);
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(JSON.stringify(await response.json())).not.toContain(ACCOUNT_NUMBER);
  });

  it("gives nothing for an application that is not pending (approved, rejected, cancelled)", async () => {
    for (const status of ["approved", "rejected", "cancelled", "expired"]) {
      vi.mocked(createClient).mockResolvedValue(fakeClient({ user: true, row: { ...pending, status } }).client as never);
      const response = await GET(url());
      expect(response.status).toBe(404);
      expect(JSON.stringify(await response.json())).not.toContain(ACCOUNT_NUMBER);
    }
  });

  it("returns the account, the reference and the server-quoted amount for the caller's own pending application", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeClient({ user: true, row: pending }).client as never);
    const response = await GET(url());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      status: "ready",
      bankName: "ธนาคารตัวอย่าง",
      accountNumber: ACCOUNT_NUMBER,
      accountName: "ทดสอบ ระบบ",
      amountThb: 299,
      referenceCode: "KA-00000005",
    });
  });

  it("takes the amount from the stored application, never from the browser's query string", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeClient({ user: true, row: { ...pending, quoted_amount_thb: 599 } }).client as never);
    const response = await GET(url(applicationId, "&amount=1&amountThb=1&quoted_amount_thb=1"));
    expect((await response.json()).amountThb).toBe(599);
  });

  it("fails closed when the stored quote is unusable", async () => {
    for (const quoted of [0, -5, "abc", null]) {
      vi.mocked(createClient).mockResolvedValue(fakeClient({ user: true, row: { ...pending, quoted_amount_thb: quoted } }).client as never);
      const response = await GET(url());
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain(ACCOUNT_NUMBER);
    }
  });
});
