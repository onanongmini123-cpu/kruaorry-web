/**
 * Friendly Thai copy for anything an ordinary member can see when something
 * goes wrong. Technical detail (database, auth, network wording) belongs in
 * logs only; this module turns whatever came back into a short sentence with a
 * next step. It never throws and never echoes an unknown English message.
 */

export const GENERIC_LOAD_ERROR = "ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองอีกครั้ง";
export const GENERIC_ACTION_ERROR = "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง หากยังไม่ได้ให้แจ้งทีมงาน";
export const NETWORK_ERROR = "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
export const SESSION_EXPIRED_ERROR = "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
export const PERMISSION_ERROR = "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ หากคิดว่าเป็นความผิดพลาด กรุณาแจ้งปัญหา";
export const SYSTEM_UPDATING_ERROR = "ระบบกำลังอัปเดต กรุณาลองใหม่อีกครั้งในอีกสักครู่ หรือติดต่อทีมงานทาง LINE";
export const DUPLICATE_ERROR = "มีรายการนี้อยู่แล้ว กรุณารีเฟรชหน้าแล้วตรวจสอบอีกครั้ง";

export const RETRY_LABEL = "ลองใหม่";
export const REPORT_PROBLEM_LABEL = "แจ้งปัญหา";

/**
 * Exact messages raised by our own database functions. Matching is by
 * case-insensitive substring so a wrapped PostgREST message still maps.
 */
const KNOWN_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["Authenticated member required", "กรุณาเข้าสู่ระบบด้วยบัญชีสมาชิกก่อนทำรายการนี้"],
  ["Member profile not found", "ไม่พบข้อมูลบัญชีของคุณ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"],
  ["Plan is not available for membership applications", "แพ็กเกจนี้ยังไม่เปิดรับสมัครในตอนนี้ กรุณาเลือกแพ็กเกจอื่น"],
  ["Founder 100 is full", "สิทธิ์ Founder ครบแล้ว กรุณาเลือกแพ็ก Teacher Pro"],
  ["Pending membership application not found", "ไม่พบใบสมัครที่รอดำเนินการ กรุณารีเฟรชหน้านี้แล้วลองอีกครั้ง"],
  ["Membership application is no longer pending", "ใบสมัครนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าแล้วตรวจสอบสถานะอีกครั้ง"],
  ["Teacher membership is not available at the canonical", "ขณะนี้ยังเปลี่ยนเป็นแพ็ก Teacher Pro ไม่ได้ กรุณาลองใหม่ภายหลัง"],
  ["Only a pending Founder application can be converted", "ใบสมัครนี้เปลี่ยนแพ็กไม่ได้แล้ว"],
  ["A pending Teacher application already exists", "คุณมีใบสมัคร Teacher Pro ที่รอดำเนินการอยู่แล้ว"],
  ["Published entitled resource required", "คุณยังไม่มีสิทธิ์ใช้สื่อนี้ จึงยังรีวิวหรือรายงานปัญหาไม่ได้"],
  ["Request rate limit reached", "วันนี้ส่งคำขอครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้"],
  ["Issue report rate limit reached", "ส่งรายงานปัญหาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"],
  ["An unresolved report of this type already exists", "คุณแจ้งปัญหานี้ไว้แล้ว ทีมงานกำลังตรวจสอบอยู่"],
  ["Saved resource limit reached", "บัญชีนี้บันทึกสื่อที่ชอบครบตามจำนวนที่กำหนดแล้ว ลบรายการเดิมก่อนบันทึกเพิ่ม"],
  ["Saving resources is not available", "แพ็กเกจนี้ยังบันทึกสื่อที่ชอบไม่ได้"],
  ["Avatar object does not belong to this member", "บันทึกรูปโปรไฟล์ไม่สำเร็จ กรุณาอัปโหลดรูปใหม่อีกครั้ง"],
  ["Cannot demote the last remaining owner", "ไม่สามารถลดสิทธิ์เจ้าของระบบคนสุดท้ายได้ — ต้องมีเจ้าของระบบอย่างน้อย 1 คนเสมอ"],
  ["Display name must contain", "ชื่อที่แสดงต้องมี 2–80 ตัวอักษร"],
  ["Request title must contain", "ชื่อคำขอต้องมี 3–200 ตัวอักษร"],
  ["Review must contain", "รีวิวต้องมี 3–1,000 ตัวอักษร"],
  ["Rating must be between", "กรุณาให้คะแนน 1–5 ดาว"],
];

const THAI = /[฀-๿]/;
const TECHNICAL = /supabase|postgres|pgrst|\brls\b|row-level|\bjwt\b|signed url|service[ _-]?role|\bsql\b|database|schema cache|stack|undefined|\bnull\b|\[object/i;
const SESSION = /\bjwt\b|auth session|session (?:expired|missing|not found)|refresh[_ ]token|not authenticated|invalid claim/i;
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|econn|enotfound|socket hang up|offline/i;
const PERMISSION = /row-level security|permission denied|not authori[sz]ed|insufficient[_ ]privilege|forbidden/i;
const MISSING_FUNCTION = /could not find the function|schema cache|does not exist|pgrst20[25]/i;

function readMessage(error: unknown): { message: string; code: string } {
  if (typeof error === "string") return { message: error, code: "" };
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; code?: unknown };
    return {
      message: typeof candidate.message === "string" ? candidate.message : "",
      code: typeof candidate.code === "string" ? candidate.code : "",
    };
  }
  return { message: "", code: "" };
}

/**
 * Turn any error value into friendly Thai. `fallback` is the per-action
 * sentence (for example "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง") used when nothing
 * more specific is known. Messages that are already Thai and contain no
 * technical wording pass through unchanged, so copy we wrote ourselves is kept.
 */
export function friendlyErrorMessage(error: unknown, fallback: string = GENERIC_ACTION_ERROR): string {
  const { message, code } = readMessage(error);
  const text = message.trim();
  if (!text && !code) return fallback;

  const lower = text.toLowerCase();
  for (const [needle, thai] of KNOWN_MESSAGES) {
    if (lower.includes(needle.toLowerCase())) return thai;
  }

  if (/^(?:PGRST202|PGRST205|42883|42P01)$/.test(code) || MISSING_FUNCTION.test(text)) return SYSTEM_UPDATING_ERROR;
  if (SESSION.test(text)) return SESSION_EXPIRED_ERROR;
  if (NETWORK.test(text)) return NETWORK_ERROR;
  if (/duplicate key|already exists|unique constraint/i.test(text) || code === "23505") return DUPLICATE_ERROR;
  if (PERMISSION.test(text) || code === "42501") return PERMISSION_ERROR;

  // Thai we wrote ourselves is already friendly; keep it unless it somehow
  // carries implementation wording.
  if (THAI.test(text) && !TECHNICAL.test(text)) return text;
  return fallback;
}
