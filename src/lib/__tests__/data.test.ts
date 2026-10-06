import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmMembershipPayment, confirmSubscriptionRenewal, convertFounderApplicationToTeacher, createMembershipApplication, fetchEntitlements, fetchEntitlementsResult, fetchFounderCapacity, fetchMembershipReturnResource, fetchMyFounderHistory, fetchMyResourceReview, fetchPlans, fetchPublishedResources, fetchResourceReviews, fetchSavedResourceIds, fetchUpgradeRequests, getSignedFileUrl, recordMembershipLineSlipReceived, setResourceSaved, submitRequest, submitResourceIssue, updateMyDisplayName, upsertMyResourceReview, deleteMyResourceReview } from "../data";
import { ASYNC_STAGE_TIMEOUT_MS } from "../asyncTimeout";
import {
  MEMBERSHIP_LINE_SLIP_WORKFLOW_READINESS_MARKER,
  MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
  MEMBERSHIP_SCHEMA_READINESS_MARKER,
  MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
} from "../membershipSchemaReadiness";

type CreateSignedUrlResult = { data: { signedUrl: string } | null; error: { message: string } | null };

function fakeSupabase(createSignedUrl: (path: string, expiresIn: number, options?: unknown) => Promise<CreateSignedUrlResult>): SupabaseClient {
  return {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  } as unknown as SupabaseClient;
}

function readinessFrom(
  ready = true,
  marker = MEMBERSHIP_SCHEMA_READINESS_MARKER,
): ReturnType<typeof vi.fn> {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: ready ? { id: marker } : null,
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return vi.fn((table: string) => {
    if (table !== "features") throw new Error(`Unexpected table in readiness probe: ${table}`);
    return { select };
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getSignedFileUrl", () => {
  it("returns the signed URL on success", async () => {
    const supabase = fakeSupabase(async () => ({ data: { signedUrl: "https://storage.example/signed?token=abc" }, error: null }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result).toEqual({ url: "https://storage.example/signed?token=abc", error: null });
  });

  it("returns a structured error instead of null when Supabase resolves with { error }", async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: "object not found" } }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/object not found/);
  });

  it("catches a thrown/rejected exception instead of propagating it as an unhandled rejection", async () => {
    const supabase = fakeSupabase(async () => {
      throw new Error("network dropped mid-request");
    });
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/network dropped/);
  });

  it("times out instead of hanging forever when the underlying call never settles", async () => {
    vi.useFakeTimers();
    const supabase = fakeSupabase(() => new Promise(() => {})); // never resolves or rejects
    const promise = getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    const result = await promise;
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/timed out/);
  });

  it("resolves well before a 25-second hang would be perceptible (regression guard for the reported blank-tab bug)", async () => {
    vi.useFakeTimers();
    const supabase = fakeSupabase(() => new Promise(() => {}));
    const promise = getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS - 1);
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(true).toBe(true); // reaching here means it settled well under 25s
  });

  it("logs nothing on success — the signed URL itself is never written to the console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase(async () => ({ data: { signedUrl: "https://storage.example/signed?token=SUPER-SECRET" }, error: null }));
    await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");
    expect(spy).not.toHaveBeenCalled();
  });

  it("on failure, logs no object path, URL, token, or original filename", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: "row-level security violation" } }));
    await getSignedFileUrl(supabase, "some-resource-id/ชื่อ-นามสกุล.pdf", "ชื่อ-นามสกุล.pdf");
    expect(errors.length).toBeGreaterThan(0);
    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).not.toMatch(/some-resource-id/);
    expect(joined).not.toMatch(/ชื่อ-นามสกุล/);
    expect(joined).not.toMatch(/token=/i);
    expect(joined).not.toMatch(/https?:\/\//);
  });

  // Regression test for a real underlying SDK/network error message that
  // happens to embed a signed URL and its token — this must never surface,
  // in either the returned error string or anything logged, not just the
  // one benign message the earlier tests happened to use.
  it("redacts a signed URL and its token embedded in a Supabase-returned error message", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => ({
      data: null,
      error: { message: "upstream request failed: https://xyz.supabase.co/storage/v1/object/sign/resource-files/r1/file.pdf?token=SUPER-SECRET-VALUE" },
    }));
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");

    expect(result.error).not.toMatch(/SUPER-SECRET-VALUE/);
    expect(result.error).not.toMatch(/https?:\/\//);

    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).not.toMatch(/SUPER-SECRET-VALUE/);
    expect(joined).not.toMatch(/https?:\/\//);
  });

  it("redacts a bearer/JWT-like credential embedded in a thrown exception's message", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const supabase = fakeSupabase(async () => {
      throw new Error("request failed with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
    });
    const result = await getSignedFileUrl(supabase, "r1/file.pdf", "file.pdf");

    expect(result.error).not.toMatch(/eyJ/);

    const joined = errors.map((a) => a.join(" ")).join("\n");
    expect(joined).not.toMatch(/eyJ/);
  });
});

describe("fetchEntitlements", () => {
  it("converts RPC rows into a keyed capability snapshot", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          { plan_id: "teacher", feature_id: "download.premium", enabled: true, limit_value: null },
          { plan_id: "teacher", feature_id: "favorites.limit", enabled: true, limit_value: 50 },
        ],
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(fetchEntitlements(supabase)).resolves.toEqual({
      planId: "teacher",
      features: {
        "download.premium": { enabled: true, limit: null },
        "favorites.limit": { enabled: true, limit: 50 },
      },
    });
  });

  it("returns unknown rather than Free when the RPC fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission denied", code: "42501", details: "", hint: "" },
      }),
    } as unknown as SupabaseClient;

    await expect(fetchEntitlements(supabase)).resolves.toBeNull();
    await expect(fetchEntitlementsResult(supabase)).resolves.toEqual({
      entitlements: null,
      error: true,
    });
  });

  it("returns unknown on timeout instead of hanging or manufacturing Free", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      rpc: vi.fn(() => new Promise(() => {})),
    } as unknown as SupabaseClient;

    const resultPromise = fetchEntitlementsResult(supabase);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({ entitlements: null, error: true });
  });

  it("treats an empty successful RPC response as a known Free account", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as unknown as SupabaseClient;

    await expect(fetchEntitlementsResult(supabase)).resolves.toEqual({
      entitlements: { planId: "free", features: {} },
      error: false,
    });
  });
});

describe("fetchFounderCapacity", () => {
  it("maps the aggregate RPC without exposing member data", async () => {
    const supabase = {
      from: readinessFrom(),
      rpc: vi.fn().mockResolvedValue({
        data: [{ used: 24, capacity: 100, remaining: 76, is_full: false }],
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(fetchFounderCapacity(supabase)).resolves.toEqual({
      used: 24,
      capacity: 100,
      remaining: 76,
      isFull: false,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("get_founder_capacity");
  });

  it("fails closed when the aggregate is malformed", async () => {
    const supabase = {
      from: readinessFrom(),
      rpc: vi.fn().mockResolvedValue({ data: [{ user_id: "must-not-leak" }], error: null }),
    } as unknown as SupabaseClient;

    await expect(fetchFounderCapacity(supabase)).resolves.toBeNull();
  });

  it("does not call the capacity RPC before the schema marker exists", async () => {
    const rpc = vi.fn();
    const supabase = { from: readinessFrom(false), rpc } as unknown as SupabaseClient;

    await expect(fetchFounderCapacity(supabase)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("membership Founder history and return-resource access", () => {
  it("reads only the caller's aggregate Founder history", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = { from: readinessFrom(true, "system.founder_first_year_once_v1_ready"), rpc } as unknown as SupabaseClient;
    await expect(fetchMyFounderHistory(supabase)).resolves.toEqual({
      hasFounderHistory: true,
      error: false,
    });
    expect(rpc).toHaveBeenCalledWith("has_my_founder_history");
  });

  it("fails closed when Founder history cannot be verified", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      from: readinessFrom(true, "system.founder_first_year_once_v1_ready"),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "missing", code: "42883" } }),
    } as unknown as SupabaseClient;
    await expect(fetchMyFounderHistory(supabase)).resolves.toEqual({
      hasFounderHistory: false,
      error: true,
    });
  });

  it("does not call the Founder-history RPC before migration 049 is ready", async () => {
    const rpc = vi.fn();
    const supabase = { from: readinessFrom(false), rpc } as unknown as SupabaseClient;

    await expect(fetchMyFounderHistory(supabase)).resolves.toEqual({
      hasFounderHistory: false,
      error: true,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps every actual supported plan for a shared resource", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { access_mode: "plans", required_plan_ids: ["founder", "teacher", "teacher", "plus", " retired ", ""] },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;

    await expect(fetchMembershipReturnResource(supabase, "resource-1")).resolves.toEqual({
      requiredPlanIds: ["founder", "teacher", "plus", "retired"],
      error: false,
    });
    expect(supabase.from).toHaveBeenCalledWith("resource_catalog");
    expect(eq).toHaveBeenCalledWith("id", "resource-1");
  });

  it("fails closed when the return resource is missing or is not plan-protected", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { access_mode: "authenticated", required_plan_ids: [] },
      error: null,
    });
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    } as unknown as SupabaseClient;
    await expect(fetchMembershipReturnResource(supabase, "resource-1")).resolves.toEqual({
      requiredPlanIds: [],
      error: true,
    });
  });
});

describe("manual membership payment RPC wrappers", () => {
  it("creates an application and normalizes the RETURNS TABLE array row", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: "request-1",
        reference_code: "KA-260001",
        plan_id: "founder",
        status: "pending",
        quoted_amount_thb: 299,
        created_at: "2026-10-01T02:00:00.000Z",
      }],
      error: null,
    });
    const supabase = { from: readinessFrom(), rpc } as unknown as SupabaseClient;

    await expect(createMembershipApplication(supabase, "founder")).resolves.toEqual({
      application: {
        id: "request-1",
        referenceCode: "KA-260001",
        planId: "founder",
        status: "pending",
        quotedAmountThb: 299,
        paymentReportedAt: null,
        lineSlipReceivedAt: null,
        paymentPaidAt: null,
        paymentConfirmedAt: null,
        paymentConfirmedAmountThb: null,
        paymentReference: null,
        resolutionReasonCode: null,
        createdAt: "2026-10-01T02:00:00.000Z",
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("create_membership_application", { p_plan_id: "founder" });
  });

  it("records an admin-observed LINE slip and converts a Founder application through narrow RPCs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          id: "request-1",
          reference_code: "KA-260001",
          plan_id: "founder",
          status: "pending",
          quoted_amount_thb: 299,
          payment_reported_at: "2026-10-01T02:30:00.000Z",
          line_slip_received_at: "2026-10-01T02:31:00.000Z",
          created_at: "2026-10-01T02:00:00.000Z",
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          id: "request-1",
          reference_code: "KA-260001",
          plan_id: "teacher",
          status: "pending",
          quoted_amount_thb: 599,
          payment_reported_at: null,
          created_at: "2026-10-01T02:00:00.000Z",
        }],
        error: null,
      });
    const lineSlipSupabase = {
      from: readinessFrom(true, MEMBERSHIP_LINE_SLIP_WORKFLOW_READINESS_MARKER),
      rpc,
    } as unknown as SupabaseClient;

    await expect(recordMembershipLineSlipReceived(lineSlipSupabase, "request-1")).resolves.toMatchObject({
      application: {
        id: "request-1",
        planId: "founder",
        quotedAmountThb: 299,
        paymentReportedAt: "2026-10-01T02:30:00.000Z",
        lineSlipReceivedAt: "2026-10-01T02:31:00.000Z",
      },
      error: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "record_membership_line_slip_received", {
      p_request_id: "request-1",
    });

    const supabase = { from: readinessFrom(), rpc } as unknown as SupabaseClient;
    await expect(convertFounderApplicationToTeacher(supabase, "request-1")).resolves.toMatchObject({
      application: {
        id: "request-1",
        referenceCode: "KA-260001",
        planId: "teacher",
        quotedAmountThb: 599,
        paymentReportedAt: null,
        lineSlipReceivedAt: null,
      },
      error: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "convert_founder_application_to_teacher", {
      p_request_id: "request-1",
    });
  });

  it("passes the exact guarded confirmation contract for applications and renewals", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "result", error: null });
    const supabase = { from: readinessFrom(), rpc } as unknown as SupabaseClient;
    const confirmation = {
      amountThb: 599,
      paymentReference: "  BANK-9988  ",
      paidAt: "2026-10-01T03:00:00.000Z",
      idempotencyKey: "admin-action-1",
    };

    await expect(confirmMembershipPayment(supabase, "request-1", confirmation)).resolves.toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(1, "confirm_membership_payment", {
      p_request_id: "request-1",
      p_amount_thb: 599,
      p_payment_reference: "BANK-9988",
      p_paid_at: "2026-10-01T03:00:00.000Z",
      p_idempotency_key: "admin-action-1",
    });

    await expect(confirmSubscriptionRenewal(supabase, "subscription-1", confirmation)).resolves.toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(2, "confirm_subscription_renewal", {
      p_subscription_id: "subscription-1",
      p_amount_thb: 599,
      p_payment_reference: "BANK-9988",
      p_paid_at: "2026-10-01T03:00:00.000Z",
      p_idempotency_key: "admin-action-1",
    });
  });

  it("keeps only the new admin LINE-receipt action closed when migration 050 is absent", async () => {
    const rpc = vi.fn();
    const supabase = {
      // The broad 048 marker is present, but the probe receives that old id
      // instead of migration 050's dedicated marker.
      from: readinessFrom(true, MEMBERSHIP_SCHEMA_READINESS_MARKER),
      rpc,
    } as unknown as SupabaseClient;

    await expect(recordMembershipLineSlipReceived(supabase, "request-1")).resolves.toEqual({
      application: null,
      error: MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never logs a payment reference echoed by PostgREST error details", async () => {
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => logged.push(args));
    const paymentReference = "PRIVATE-BANK-REFERENCE-9988";
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: `duplicate payment reference ${paymentReference}`,
        code: "23505",
        details: `Key (payment_reference)=(${paymentReference}) already exists.`,
        hint: paymentReference,
      },
    });
    const supabase = { from: readinessFrom(), rpc } as unknown as SupabaseClient;

    await confirmMembershipPayment(supabase, "request-1", {
      amountThb: 599,
      paymentReference,
      paidAt: "2026-10-01T03:00:00.000Z",
      idempotencyKey: "admin-action-2",
    });

    const output = logged.flat().join(" ");
    expect(output).toContain("code=23505");
    expect(output).not.toContain(paymentReference);
    expect(output).not.toContain("payment_reference");
  });

  it("fails closed before touching any new membership table or RPC when the marker is absent", async () => {
    const touchedTables: string[] = [];
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn((table: string) => {
      touchedTables.push(table);
      if (table !== "features") throw new Error(`Unsafe table access before readiness: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      };
    });
    const rpc = vi.fn();
    const supabase = { from, rpc } as unknown as SupabaseClient;

    await expect(fetchUpgradeRequests(supabase, "user-1")).resolves.toEqual([]);
    await expect(createMembershipApplication(supabase, "founder")).resolves.toEqual({
      application: null,
      error: MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
    });
    await expect(recordMembershipLineSlipReceived(supabase, "request-1")).resolves.toEqual({
      application: null,
      error: MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
    });
    await expect(convertFounderApplicationToTeacher(supabase, "request-1")).resolves.toEqual({
      application: null,
      error: MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
    });
    await expect(confirmMembershipPayment(supabase, "request-1", {
      amountThb: 299,
      paymentReference: "BANK-1",
      paidAt: "2026-10-01T03:00:00.000Z",
      idempotencyKey: "admin-action-1",
    })).resolves.toBe(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
    await expect(confirmSubscriptionRenewal(supabase, "subscription-1", {
      amountThb: 599,
      paymentReference: "BANK-2",
      paidAt: "2026-10-01T03:00:00.000Z",
      idempotencyKey: "admin-action-2",
    })).resolves.toBe(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);

    expect(touchedTables).toEqual(Array(7).fill("features"));
    expect(from).not.toHaveBeenCalledWith("upgrade_requests");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the persisted resolution reason code only after readiness succeeds", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: MEMBERSHIP_SCHEMA_READINESS_MARKER },
      error: null,
    });
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: "request-test",
        reference_code: "KA-TEST",
        plan_id: "founder",
        status: "declined",
        quoted_amount_thb: 299,
        payment_reported_at: null,
        payment_paid_at: null,
        payment_confirmed_at: null,
        payment_confirmed_amount_thb: null,
        payment_reference: null,
        resolution_reason_code: "owner_test_cleanup",
        created_at: "2026-10-01T02:00:00.000Z",
      }],
      error: null,
    });
    const upgradeSelect = vi.fn((columns: string) => {
      void columns;
      return { eq: vi.fn(() => ({ order })) };
    });
    const from = vi.fn((table: string) => table === "features"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }
      : { select: upgradeSelect });
    const supabase = { from } as unknown as SupabaseClient;

    await expect(fetchUpgradeRequests(supabase, "user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "request-test",
        status: "declined",
        resolutionReasonCode: "owner_test_cleanup",
      }),
    ]);
    expect(upgradeSelect).toHaveBeenCalledWith(expect.stringContaining("resolution_reason_code"));
    expect(upgradeSelect.mock.calls[0]?.[0]).not.toContain("line_slip_received_at");
  });

  it("selects admin LINE-receipt provenance only after migration 050 is ready", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: "request-line-slip",
        reference_code: "KA-LINE",
        plan_id: "teacher",
        status: "pending",
        quoted_amount_thb: 599,
        payment_reported_at: "2026-10-01T02:30:00.000Z",
        line_slip_received_at: "2026-10-01T02:31:00.000Z",
        payment_paid_at: null,
        payment_confirmed_at: null,
        payment_confirmed_amount_thb: null,
        payment_reference: null,
        resolution_reason_code: null,
        created_at: "2026-10-01T02:00:00.000Z",
      }],
      error: null,
    });
    const upgradeSelect = vi.fn((columns: string) => {
      void columns;
      return { eq: vi.fn(() => ({ order })) };
    });
    const from = vi.fn((table: string) => table === "features"
      ? {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, marker: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: marker }, error: null }),
            })),
          })),
        }
      : { select: upgradeSelect });
    const supabase = { from } as unknown as SupabaseClient;

    await expect(fetchUpgradeRequests(supabase, "user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "request-line-slip",
        paymentReportedAt: "2026-10-01T02:30:00.000Z",
        lineSlipReceivedAt: "2026-10-01T02:31:00.000Z",
      }),
    ]);
    expect(upgradeSelect).toHaveBeenCalledWith(expect.stringContaining("line_slip_received_at"));
  });
});

describe("fetchMyResourceReview", () => {
  it("reads only the caller's review through the narrow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ rating: 4, body: "นำไปใช้กับนักเรียนได้จริง" }],
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(fetchMyResourceReview(supabase, "resource-1")).resolves.toEqual({
      rating: 4,
      body: "นำไปใช้กับนักเรียนได้จริง",
    });
    expect(rpc).toHaveBeenCalledWith("get_my_resource_review", { p_resource_id: "resource-1" });
  });

  it("fails closed for malformed or unavailable RPC data", async () => {
    const malformed = {
      rpc: vi.fn().mockResolvedValue({ data: [{ rating: 99, body: "invalid" }], error: null }),
    } as unknown as SupabaseClient;
    await expect(fetchMyResourceReview(malformed, "resource-1")).resolves.toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    const denied = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Authenticated member required", code: "42501", details: "", hint: "" },
      }),
    } as unknown as SupabaseClient;
    await expect(fetchMyResourceReview(denied, "resource-1")).resolves.toBeNull();
  });
});

describe("fetchResourceReviews", () => {
  it("loads only the latest 20 public reviews while the catalog keeps the aggregate", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    await expect(fetchResourceReviews(supabase, "resource-1")).resolves.toEqual([]);
    expect(supabase.from).toHaveBeenCalledWith("resource_review_feed");
    expect(query.eq).toHaveBeenCalledWith("resource_id", "resource-1");
    expect(query.limit).toHaveBeenCalledWith(20);
  });
});

describe("public catalog reads", () => {
  it("uses only the safe catalog view and never requests private destination columns", async () => {
    const rows = [
      {
        id: "one",
        title: "แบบฝึกจริง",
        meta: "",
        description: "",
        category: "",
        delivery_mode: "file_download",
        cover_image_url: null,
        tags: [],
        grade_levels: [],
        access_mode: "authenticated",
        required_plan_ids: ["teacher_pro", "teacher"],
        required_plan_names: ["Teacher"],
        is_free: true,
        is_new: true,
        file_size: 100,
        featured_rank: null,
        review_average: null,
        review_count: 0,
      },
    ];
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    await expect(fetchPublishedResources(client)).resolves.toMatchObject([{
      id: "one",
      title: "แบบฝึกจริง",
      isNew: true,
      requiredPlanNames: ["Teacher Pro (แพ็กเดิม)", "Teacher Pro"],
    }]);
    expect(client.from).toHaveBeenCalledWith("resource_catalog");
    expect(query.select).toHaveBeenCalledWith(expect.not.stringMatching(/cta_url|file_path|file_name/));
    expect(query.select).toHaveBeenCalledWith(expect.stringMatching(/grade_levels.*access_mode.*required_plan_ids.*required_plan_names.*is_new.*featured_rank.*review_average.*review_count/));
    expect(query.order).toHaveBeenNthCalledWith(1, "published_at", { ascending: false, nullsFirst: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("ends a stalled plan request instead of leaving the home page loading forever", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const planQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const benefitQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    const client = {
      from: vi.fn((table: string) => table === "plans" ? planQuery : benefitQuery),
    } as unknown as SupabaseClient;

    const result = fetchPlans(client);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toEqual([]);
    expect(client.from).toHaveBeenCalledWith("plans");
    expect(client.from).toHaveBeenCalledWith("plan_benefit_catalog");
  });

  it("uses customer-facing labels while keeping canonical plan ids unchanged", async () => {
    const planQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "teacher", name: "Teacher", price_label: "599 บาท/ปี", note: null, is_popular: true, billing_interval: "year" },
          { id: "teacher_pro", name: "Teacher Pro", price_label: "แพ็กเดิม", note: null, is_popular: false, billing_interval: "year" },
        ],
        error: null,
      }),
    };
    const benefitQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn(),
    };
    benefitQuery.order.mockReturnValueOnce(benefitQuery).mockResolvedValueOnce({ data: [], error: null });
    const client = {
      from: vi.fn((table: string) => table === "plans" ? planQuery : benefitQuery),
    } as unknown as SupabaseClient;

    await expect(fetchPlans(client)).resolves.toMatchObject([
      { id: "teacher", name: "Teacher Pro" },
      { id: "teacher_pro", name: "Teacher Pro (แพ็กเดิม)" },
    ]);
  });
});

describe("setResourceSaved", () => {
  it("returns a write error so the UI does not show a failed save as successful", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Saved resource limit reached", code: "P0001", details: "", hint: "" } });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", true)).resolves.toBe("Saved resource limit reached");
    expect(rpc).toHaveBeenCalledWith("set_my_resource_saved", { p_resource_id: "resource-1", p_saved: true });
  });

  it("returns null after a successful save", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", true)).resolves.toBeNull();
  });

  it("uses the same isolated RPC to remove a saved resource", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(setResourceSaved(supabase, "resource-1", false)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("set_my_resource_saved", { p_resource_id: "resource-1", p_saved: false });
  });

  it("times out so an optimistic bookmark can roll back instead of staying disabled", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = { rpc: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as SupabaseClient;

    const result = setResourceSaved(supabase, "resource-1", true);
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toMatch(/timed out/);
  });
});

describe("fetchSavedResourceIds", () => {
  it("paginates a large favorites collection instead of relying on the API row cap", async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ resource_id: `resource-${index}` }));
    const range = vi.fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: [{ resource_id: "resource-500" }], error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    const ids = await fetchSavedResourceIds(supabase, "user-1");
    expect(ids).toHaveLength(501);
    expect(range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("times out a stalled favorites read so member loading can finish", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;

    const result = fetchSavedResourceIds(supabase, "user-1");
    await vi.advanceTimersByTimeAsync(ASYNC_STAGE_TIMEOUT_MS);
    await expect(result).resolves.toEqual([]);
  });
});

describe("member-facing write errors are friendly Thai", () => {
  function rpcError(message: string, code = "P0001") {
    return { rpc: vi.fn().mockResolvedValue({ data: null, error: { message, code, details: "", hint: "" } }) } as unknown as SupabaseClient;
  }

  afterEach(() => vi.restoreAllMocks());

  it("maps known rules to specific Thai and hides everything else behind a per-action sentence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(submitRequest(rpcError("Request rate limit reached"), "ชื่อคำขอ"))
      .resolves.toBe("วันนี้ส่งคำขอครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้");
    await expect(upsertMyResourceReview(rpcError("Published entitled resource required"), "r1", 5, "ดีมาก"))
      .resolves.toContain("ยังไม่มีสิทธิ์ใช้สื่อนี้");
    await expect(deleteMyResourceReview(rpcError('new row violates row-level security policy for table "x"', "42501"), "r1"))
      .resolves.not.toMatch(/row-level|violates|table/i);
    await expect(submitResourceIssue(rpcError("weird english"), "r1", "wrong_content", "รายละเอียด"))
      .resolves.toBe("ส่งรายงานปัญหาไม่สำเร็จ กรุณาลองอีกครั้ง");
  });

  it("never exposes a missing database function to a member", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await updateMyDisplayName(
      rpcError("Could not find the function public.update_my_display_name(p_full_name) in the schema cache", "PGRST202"),
      "ครูอรรี่",
    );
    expect(result).toBe("ระบบกำลังอัปเดต กรุณาลองใหม่อีกครั้งในอีกสักครู่ หรือติดต่อทีมงานทาง LINE");
    expect(result).not.toMatch(/function|schema|public\./i);
  });
});
