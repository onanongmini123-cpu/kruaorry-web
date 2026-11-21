import { describe, expect, it } from "vitest";
import type { UpgradeRequest } from "../data";
import { applicationHistory } from "../membershipHistory";

const app = (over: Partial<UpgradeRequest>): UpgradeRequest => ({
  id: "id", referenceCode: "KA-1", planId: "teacher", status: "pending", quotedAmountThb: 599,
  paymentReportedAt: null, lineSlipReceivedAt: null, paymentPaidAt: null, paymentConfirmedAt: null,
  paymentConfirmedAmountThb: null, paymentReference: null, resolutionReasonCode: null, createdAt: "2026-11-01T00:00:00Z", ...over,
});

describe("applicationHistory", () => {
  it("keeps declined and approved applications and drops the pending one (it has its own step)", () => {
    const list = [
      app({ id: "p", status: "pending", createdAt: "2026-11-20T00:00:00Z" }),
      app({ id: "d", status: "declined", createdAt: "2026-11-05T00:00:00Z" }),
      app({ id: "a", status: "approved", createdAt: "2026-10-01T00:00:00Z" }),
    ];
    expect(applicationHistory(list).map((x) => x.id)).toEqual(["d", "a"]);
  });

  it("lists the newest first and does not change the input", () => {
    const list = [app({ id: "old", status: "declined", createdAt: "2026-01-01T00:00:00Z" }), app({ id: "new", status: "declined", createdAt: "2026-06-01T00:00:00Z" })];
    expect(applicationHistory(list).map((x) => x.id)).toEqual(["new", "old"]);
    expect(list.map((x) => x.id)).toEqual(["old", "new"]);
  });

  it("is empty when there is nothing old", () => {
    expect(applicationHistory([])).toEqual([]);
    expect(applicationHistory([app({ status: "pending" })])).toEqual([]);
  });
});
