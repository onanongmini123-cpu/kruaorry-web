import type { UpgradeRequest } from "@/lib/data";
import { planDisplayName } from "@/lib/planDisplay";

export function membershipApplicationPlanLabel(planId: string): string {
  return planDisplayName(planId, planId === "founder" ? "Founder" : null);
}

export function isTestCleanupReason(reasonCode: string | null): boolean {
  return ["owner_test_cleanup", "test_application_cleanup"].includes(reasonCode ?? "");
}

export function resolvedStatusCopy(application: UpgradeRequest): { label: string; tone: "success" | "neutral"; detail: string } {
  if (application.status === "approved") return {
    label: "ยืนยันชำระแล้ว",
    tone: "success",
    detail: "ครูอรรี่ยืนยันการชำระแล้ว สิทธิ์สมาชิกจะนับจากรายการที่อนุมัตินี้",
  };
  if (isTestCleanupReason(application.resolutionReasonCode)) return {
    label: "ยกเลิกรายการทดสอบ",
    tone: "neutral",
    detail: "รายการนี้เป็นข้อมูลทดสอบของเจ้าของระบบและถูกยกเลิกแล้ว ไม่มีการให้สิทธิ์หรือใช้โควตา Founder",
  };
  return {
    label: "ไม่ผ่านการตรวจสอบ",
    tone: "neutral",
    detail: "รายการนี้ไม่ได้รับสิทธิ์ หากต้องการสอบถามรายละเอียด กรุณาติดต่อครูอรรี่ทาง LINE",
  };
}

export function formatThaiDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}
