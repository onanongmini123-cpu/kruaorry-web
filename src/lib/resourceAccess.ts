import type { ResourceAccessMode } from "@/lib/entitlement";

/**
 * Customer-facing access tiers. The database keeps its own `access_mode`
 * values; this is the single place that maps them to the three labels users
 * see (plus "not yet open" for locked resources).
 */
export type AccessTier = "free" | "member" | "pro" | "unavailable";

export const ACCESS_TIER_LABEL: Record<AccessTier, string> = {
  free: "ใช้ฟรี",
  member: "สมาชิกฟรี",
  pro: "Teacher Pro",
  unavailable: "ยังไม่เปิดให้ใช้งาน",
};

export const ACCESS_TIER_DESCRIPTION: Record<AccessTier, string> = {
  free: "เปิดใช้ได้ทันที ไม่ต้องสมัคร",
  member: "สมัครบัญชีฟรีเพื่อใช้งาน",
  pro: "สำหรับสมาชิก Teacher Pro",
  unavailable: "สื่อนี้ยังไม่เปิดให้ใช้งาน",
};

export function accessTier(mode: ResourceAccessMode): AccessTier {
  switch (mode) {
    case "public":
      return "free";
    case "authenticated":
      return "member";
    case "plans":
      return "pro";
    default:
      return "unavailable";
  }
}

export function accessLabel(mode: ResourceAccessMode): string {
  return ACCESS_TIER_LABEL[accessTier(mode)];
}

export function accessDescription(mode: ResourceAccessMode): string {
  return ACCESS_TIER_DESCRIPTION[accessTier(mode)];
}
