/**
 * Customer-facing wording for plan benefits.
 *
 * Benefit names and descriptions come from the `features` table, which was
 * seeded with developer wording ("ค่าสูงสุดต่อสมาชิก; null หมายถึงไม่จำกัด",
 * "ดาวน์โหลดไฟล์พรีเมียมผ่าน signed URL"). Capability ids are stable, so known
 * ones get approved Thai copy here no matter what the database currently
 * holds, and any other copy is scrubbed of implementation wording instead of
 * being shown. The numbers/limits themselves still come from configuration.
 */

export interface BenefitCopy {
  name: string;
  description: string | null;
}

const KNOWN_COPY: Readonly<Record<string, BenefitCopy>> = {
  "library.premium": {
    name: "เกมและสื่อ Pro",
    description: "เปิดใช้เกมและสื่อที่เป็นสิทธิ์ของ Teacher Pro",
  },
  "download.premium": {
    name: "ดาวน์โหลดสื่อ Pro",
    description: "ดาวน์โหลดไฟล์สื่อ Pro ได้ตามสิทธิ์ของแพ็ก",
  },
  "favorites.enabled": {
    name: "บันทึกสื่อที่ชอบ",
    description: "เก็บสื่อที่ใช้บ่อยไว้ในรายการโปรด",
  },
  // The value ("ไม่จำกัด" or a number) is shown next to the name.
  "favorites.limit": {
    name: "จำนวนรายการโปรด",
    description: null,
  },
};

const IMPLEMENTATION_WORDING = /\bnull\b|signed\s*url|supabase|\brls\b|\bjwt\b|\bapi\b|database|service[ _-]?role|\bsql\b|\bjson\b|\buuid\b|\bendpoint\b|\bserver\b|\bcache\b/i;
const RETIRED_MARKETING_WORDS = /พรีเมียม|premium/i;

function scrub(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (IMPLEMENTATION_WORDING.test(text)) return null;
  return text.replace(RETIRED_MARKETING_WORDS, " Pro ").replace(/\s+/g, " ").trim();
}

export function customerBenefitCopy(benefit: {
  featureId: string;
  name: string;
  description: string | null;
}): BenefitCopy {
  const known = KNOWN_COPY[benefit.featureId];
  if (known) return known;
  return {
    name: scrub(benefit.name) ?? "สิทธิ์สำหรับสมาชิก",
    description: scrub(benefit.description),
  };
}
