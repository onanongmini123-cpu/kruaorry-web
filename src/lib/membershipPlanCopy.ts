import type { MembershipJourneyPlanId } from "@/lib/membershipJourney";

// What the plan cards on step 1 say. The prices are the same fixed amounts the
// application is created with (299 first year Founder, 599 Teacher Pro).
export const PLAN_CARD_COPY: Record<MembershipJourneyPlanId, { title: string; price: string; priceNote: string | null }> = {
  founder: { title: "Founder 100", price: "299 บาท ปีแรก", priceNote: "(ปีต่อไป 599)" },
  teacher: { title: "Teacher Pro", price: "599 บาท/ปี", priceNote: null },
};

/** Three short lines for every plan; Founder also gets its badge. */
export function planBenefitLines(planId: MembershipJourneyPlanId): string[] {
  const lines = ["เล่นเกมและใช้สื่อ Pro ได้ทุกชิ้น", "ดาวน์โหลดไฟล์ Pro", "บันทึกสื่อโปรดไม่จำกัด"];
  return planId === "founder" ? [...lines, "ตรา Founder"] : lines;
}

/** Said once on step 1, under the button. */
export const START_HINT = "สิทธิ์เริ่มใช้ได้หลังครูอรรี่ตรวจยอดเงินแล้ว";
