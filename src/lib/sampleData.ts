// Sample/placeholder content for this fresh prototype build — kruaorry-web
// has no backend yet (explicit owner decision: start clean, don't reuse the
// old Supabase project). Nothing here is real member or revenue data; it
// exists only so the screens have something to render. Replace with real
// data once a backend is wired up.

import type { LucideIcon } from "lucide-react";
import { Sparkles, FileSpreadsheet, Gamepad2, Award, ClipboardCheck } from "lucide-react";
import type { ResourceAffordance } from "@/components/ui";

export interface SampleResource {
  id: string;
  title: string;
  meta: string;
  affordance: ResourceAffordance;
  tags: string[];
  icon: LucideIcon;
  tint: "purple" | "pink" | "blue";
  free: boolean;
  category: string;
  what: string;
  helps: string;
}

export const CATEGORIES = [
  { key: "ai_tools", label: "AI & Prompts" },
  { key: "sheets_automation", label: "Google Sheets & Script" },
  { key: "web_apps", label: "Interactive Web Apps" },
  { key: "assessment", label: "แบบประเมิน" },
];

export const SAMPLE_RESOURCES: SampleResource[] = [
  {
    id: "quiz-wheel",
    title: "วงล้อสุ่มคำถามท้ายบทเรียน",
    meta: "Interactive Web Apps · ป.1–ป.6",
    affordance: "web_app",
    tags: ["เกม", "ทบทวนบทเรียน"],
    icon: Gamepad2,
    tint: "pink",
    free: true,
    category: "web_apps",
    what: "เว็บแอปวงล้อสุ่มคำถามสำหรับทบทวนท้ายคาบ เปิดใช้ได้ทันทีบนจอหน้าห้อง",
    helps: "ช่วยให้ครูทบทวนบทเรียนได้สนุกขึ้นโดยไม่ต้องเตรียมเกมเอง",
  },
  {
    id: "attendance-sheet",
    title: "สมุดเช็กชื่อและคะแนนความประพฤติ",
    meta: "Google Sheets & Script · ธุรการชั้นเรียน",
    affordance: "google_template",
    tags: ["เช็กชื่อ", "คะแนน"],
    icon: FileSpreadsheet,
    tint: "blue",
    free: false,
    category: "sheets_automation",
    what: "เทมเพลต Google Sheets สำหรับเช็กชื่อรายวันและสรุปคะแนนความประพฤติอัตโนมัติ",
    helps: "ทำสำเนาไปใช้กับข้อมูลนักเรียนของครูเองได้ทันที ไม่ปนกับห้องอื่น",
  },
  {
    id: "quiz-generator",
    title: "ตัวช่วยออกข้อสอบท้ายหน่วย",
    meta: "AI & Prompts · ทุกระดับชั้น",
    affordance: "web_app",
    tags: ["AI", "ข้อสอบ"],
    icon: Sparkles,
    tint: "purple",
    free: false,
    category: "ai_tools",
    what: "บอกหัวข้อและระดับชั้น ระบบช่วยร่างข้อสอบพร้อมเฉลยให้ทันที",
    helps: "ประหยัดเวลาออกข้อสอบ ครูตรวจทานและปรับแก้ได้ก่อนใช้จริง",
  },
  {
    id: "field-trip-form",
    title: "แบบฟอร์มขออนุญาตผู้ปกครองไปทัศนศึกษา",
    meta: "Google Forms · ธุรการโรงเรียน",
    affordance: "google_form",
    tags: ["แบบฟอร์ม", "ผู้ปกครอง"],
    icon: ClipboardCheck,
    tint: "blue",
    free: true,
    category: "assessment",
    what: "แบบฟอร์มขออนุญาตผู้ปกครองพร้อม Google Sheet สรุปผลอัตโนมัติ",
    helps: "เก็บคำตอบและสรุปจำนวนนักเรียนที่ได้รับอนุญาตโดยไม่ต้องนับมือ",
  },
  {
    id: "rubric-builder",
    title: "ตัวช่วยสร้างเกณฑ์ประเมินชิ้นงาน",
    meta: "แบบประเมิน · ว PA",
    affordance: "google_template",
    tags: ["ว PA", "ประเมิน"],
    icon: Award,
    tint: "purple",
    free: false,
    category: "assessment",
    what: "เทมเพลตเกณฑ์การให้คะแนน (rubric) พร้อมตัวอย่างสำหรับงานประเมิน ว PA",
    helps: "ทำสำเนาแล้วปรับหัวข้อเกณฑ์ให้ตรงกับชิ้นงานของแต่ละวิชาได้เลย",
  },
];

export interface SamplePlan {
  id: string;
  name: string;
  priceLabel: string;
  note: string;
  badge?: string;
  features: string[];
}

export const SAMPLE_PLANS: SamplePlan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "ฟรี",
    note: "ดาวน์โหลด 3 รายการ และใช้เครื่องมือ AI ได้ 3 ครั้งต่อเดือน",
    features: ["สื่อฟรีและเกมในห้องเรียนทั้งหมด", "ดูตัวอย่างได้ทุกชิ้น"],
  },
  {
    id: "plus",
    name: "Plus",
    priceLabel: "฿99/เดือน",
    note: "ยกเลิกได้ทุกเมื่อ — ราคาตัวอย่าง ยังไม่ใช่ราคาขายจริง",
    badge: "ครูส่วนใหญ่เลือก",
    features: ["ดาวน์โหลดสื่อในคลังไม่จำกัด", "เครื่องมือ AI ไม่จำกัด"],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    priceLabel: "฿699 จ่ายครั้งเดียว",
    note: "ราคาตัวอย่าง ยังไม่ใช่ราคาขายจริง",
    features: ["ทุกอย่างในแพ็ก Plus ตลอดชีพ", "สื่อพรีเมียมรายชิ้นทั้งหมด"],
  },
];

export interface SampleMember {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: "active" | "expired";
}

export const SAMPLE_MEMBERS: SampleMember[] = [
  { id: "1", name: "ครูสมหญิง ใจดี", email: "somying@example.ac.th", plan: "Plus", status: "active" },
  { id: "2", name: "ครูวิชัย รักเรียน", email: "wichai@example.ac.th", plan: "Lifetime", status: "active" },
  { id: "3", name: "ครูนภา แสงทอง", email: "napha@example.ac.th", plan: "Free", status: "expired" },
];

export interface SampleRequest {
  id: string;
  title: string;
  votes: number;
  who: string;
  status: "pending" | "in_production" | "declined";
}

export const SAMPLE_REQUESTS: SampleRequest[] = [
  { id: "1", title: "ตารางสรุปคะแนนสอบกลางภาคอัตโนมัติ", votes: 24, who: "ครู 12 คนขอ", status: "pending" },
  { id: "2", title: "เกมทบทวนคำศัพท์ภาษาอังกฤษ ป.3", votes: 15, who: "ครู 8 คนขอ", status: "in_production" },
];
