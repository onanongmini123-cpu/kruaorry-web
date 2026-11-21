// Which of the membership page's reads did not succeed, in words a teacher can
// read. The page used to show one "กำลังตรวจสอบสิทธิ์" label both while loading
// and after a read failed, so a failed read looked like a page stuck loading.

export type MembershipCheckKey =
  | "readiness"
  | "founderCapacity"
  | "founderHistory"
  | "applications"
  | "entitlements"
  | "subscription";

export const MEMBERSHIP_CHECK_LABEL: Record<MembershipCheckKey, string> = {
  readiness: "ความพร้อมของระบบสมัครสมาชิก",
  founderCapacity: "จำนวนที่นั่ง Founder",
  founderHistory: "ประวัติการใช้สิทธิ์ Founder ของบัญชี",
  applications: "ใบสมัครของบัญชี",
  entitlements: "สิทธิ์การใช้งานของบัญชี",
  subscription: "สถานะสมาชิกของบัญชี",
};

export interface MembershipChecksInput {
  isConfigured: boolean;
  schemaReadiness: "checking" | "ready" | "unavailable";
  authLoaded: boolean;
  signedIn: boolean;
  memberStatusLoaded: boolean;
  capacityLoaded: boolean;
  founderHistoryLoaded: boolean;
  /** The Founder plan is the selected one, so its two reads are needed. */
  founderChecksNeeded: boolean;
  capacityMissing: boolean;
  founderHistoryError: boolean;
  applicationsError: boolean;
  entitlementsError: boolean;
  subscriptionError: boolean;
}

/** True while at least one read the page needs has not answered yet. */
export function membershipChecksLoading(input: MembershipChecksInput): boolean {
  if (!input.isConfigured) return false;
  if (input.schemaReadiness === "checking" || !input.authLoaded) return true;
  if (input.schemaReadiness !== "ready") return false;
  if (!input.memberStatusLoaded || !input.capacityLoaded) return true;
  return input.signedIn && input.founderChecksNeeded && !input.founderHistoryLoaded;
}

/** The reads that finished with a failure, in a stable order. Empty while loading. */
export function failedMembershipChecks(input: MembershipChecksInput): MembershipCheckKey[] {
  if (!input.isConfigured || membershipChecksLoading(input)) return [];
  if (input.schemaReadiness === "unavailable") return ["readiness"];
  const failed: MembershipCheckKey[] = [];
  if (input.founderChecksNeeded && input.capacityMissing) failed.push("founderCapacity");
  if (input.signedIn && input.founderChecksNeeded && input.founderHistoryError) failed.push("founderHistory");
  if (input.signedIn && input.applicationsError) failed.push("applications");
  if (input.signedIn && input.entitlementsError) failed.push("entitlements");
  if (input.signedIn && input.subscriptionError) failed.push("subscription");
  return failed;
}

const FOUNDER_ONLY = new Set<MembershipCheckKey>(["founderCapacity", "founderHistory"]);

/** True when only the Founder-specific reads failed, so Teacher Pro can still be chosen. */
export function onlyFounderChecksFailed(failed: readonly MembershipCheckKey[]): boolean {
  return failed.length > 0 && failed.every((key) => FOUNDER_ONLY.has(key));
}

export function failedMembershipChecksMessage(failed: readonly MembershipCheckKey[]): string {
  return `ตรวจสอบไม่สำเร็จ: ${failed.map((key) => MEMBERSHIP_CHECK_LABEL[key]).join(", ")}`;
}

/** What a disabled plan button says when the reason is "not checked yet" or "check failed". */
export function planCheckLabel(loading: boolean): string {
  return loading ? "กำลังตรวจสอบสิทธิ์…" : "ตรวจสอบไม่สำเร็จ";
}
