import type { PublicResource, PublicResourceAction, PublicResourceViewer } from "./catalog";
import { requiredPlansLabel } from "./catalog";

export interface ResourceAccessCopy {
  /** One line under the cover. */
  coverCaption: string;
  /** Heading of the call-to-action card. */
  heading: string;
  /** Explanation under the heading, in customer words. */
  description: string;
  upgradePending: boolean;
}

/**
 * Wording for the access card of a detail page. The resource decides what it
 * asks for (its tier); the viewer decides whether that is already satisfied.
 * Keeping both in one pure function makes the whole matrix testable.
 */
export function resourceAccessCopy(
  item: PublicResource,
  viewer: PublicResourceViewer,
  action: PublicResourceAction,
): ResourceAccessCopy {
  const planLabel = requiredPlansLabel(item);
  const upgradePending = item.accessMode === "plans"
    && item.requiredPlanIds.some((planId) => (viewer.pendingPlanIds ?? []).includes(planId));

  const coverCaption = item.accessMode === "public"
    ? "ภาพปกและรายละเอียดของสื่อนี้ · เปิดใช้ได้ทันที ไม่ต้องสมัคร"
    : item.accessMode === "authenticated"
      ? "ภาพปกและรายละเอียดของสื่อนี้ · สมัครบัญชีฟรีเพื่อใช้งาน"
      : item.accessMode === "locked"
        ? "ภาพปกและรายละเอียดของสื่อนี้ · ยังไม่เปิดให้ใช้งาน"
        : `ภาพปกและรายละเอียดของสื่อนี้ · สำหรับสมาชิก ${planLabel}`;

  const heading = action.canUse
    ? viewer.authenticated ? "บัญชีของคุณเปิดใช้สื่อนี้ได้" : "เปิดใช้สื่อนี้ได้ทันที"
    : upgradePending
      ? "คำขออัปเกรดอยู่ระหว่างดำเนินการ"
      : item.accessMode === "locked"
        ? "สื่อนี้ยังไม่เปิดให้ใช้งาน"
        : item.accessMode === "authenticated"
          ? "เริ่มใช้สื่อนี้ด้วยบัญชีฟรี"
          : `สื่อนี้ต้องใช้ ${planLabel}`;

  const description = action.canUse
    ? item.accessMode === "public"
      ? "ระบบจะตรวจว่าสื่อยังเผยแพร่อยู่ก่อนเปิด โดยไม่บังคับให้สร้างบัญชี"
      : "ระบบจะตรวจสิทธิ์ของบัญชีคุณอีกครั้งก่อนเปิดสื่อหรือดาวน์โหลด"
    : upgradePending
      ? "ติดตามเลขอ้างอิง สถานะการชำระ และผลการตรวจสอบได้ในหน้าสมาชิก ระบบจะตรวจสิทธิ์อีกครั้งก่อนเปิดสื่อเสมอ"
      : item.accessMode === "locked"
        ? "ทีมงานยังไม่เปิดสื่อนี้ จึงยังไม่สามารถสมัครหรืออัปเกรดเพื่อใช้งานได้"
        : item.accessMode === "authenticated"
          ? "สมัครบัญชีฟรีเพื่อใช้งาน ไม่ต้องเลือกแพ็กเสียเงิน"
          : viewer.authenticated
            ? "บัญชีนี้ยังไม่มีแพ็กที่ใช้สื่อนี้ได้ ดูรายละเอียดแพ็กเพื่อขออัปเกรด"
            : "เข้าสู่ระบบหากมีแพ็กที่ใช้สื่อนี้ได้ หรือสมัครสมาชิกเพื่อดูรายละเอียดการอัปเกรด";

  return { coverCaption, heading, description, upgradePending };
}
