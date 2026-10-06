import { describe, expect, it } from "vitest";
import { customerBenefitCopy } from "../benefitCopy";

describe("customer benefit copy", () => {
  it("replaces the seeded developer wording for known capabilities", () => {
    expect(customerBenefitCopy({
      featureId: "download.premium",
      name: "ดาวน์โหลดพรีเมียม",
      description: "ดาวน์โหลดไฟล์พรีเมียมผ่าน signed URL",
    })).toEqual({ name: "ดาวน์โหลดสื่อ Pro", description: "ดาวน์โหลดไฟล์สื่อ Pro ได้ตามสิทธิ์ของแพ็ก" });
    expect(customerBenefitCopy({
      featureId: "favorites.limit",
      name: "จำนวนรายการโปรด",
      description: "ค่าสูงสุดต่อสมาชิก; null หมายถึงไม่จำกัด",
    }).description).toBeNull();
    expect(customerBenefitCopy({
      featureId: "library.premium",
      name: "คลังสื่อพรีเมียม",
      description: "เปิดสื่อและไฟล์พรีเมียม",
    }).name).toBe("เกมและสื่อ Pro");
  });

  it("never lets implementation wording or the retired Premium word through for unknown capabilities", () => {
    const copy = customerBenefitCopy({
      featureId: "future.thing",
      name: "ฟีเจอร์พรีเมียมใหม่",
      description: "เรียก API แล้วคืนค่า null จาก database",
    });
    expect(copy.description).toBeNull();
    expect(copy.name).toBe("ฟีเจอร์ Pro ใหม่");
    expect(customerBenefitCopy({ featureId: "x", name: "signed URL", description: null }).name).toBe("สิทธิ์สำหรับสมาชิก");
  });

  it("keeps clean admin-written copy for unknown capabilities", () => {
    expect(customerBenefitCopy({
      featureId: "membership.founder_badge",
      name: "ตรา Founder",
      description: "แสดงสถานะ Founder ที่ยังรักษาสิทธิ์อยู่",
    })).toEqual({ name: "ตรา Founder", description: "แสดงสถานะ Founder ที่ยังรักษาสิทธิ์อยู่" });
  });
});
