import type { CurriculumPack } from "./types";

export const OBEC_MATH_SOURCE_URL =
  "https://academic.obec.go.th/images/document/1580786328_d_1.pdf";

const SOURCE = {
  title: "ตัวชี้วัดและสาระการเรียนรู้แกนกลาง กลุ่มสาระการเรียนรู้คณิตศาสตร์",
  publisher: "สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน และ สสวท.",
  edition: "ฉบับปรับปรุง พ.ศ. 2560 ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551",
  url: OBEC_MATH_SOURCE_URL,
} as const;

export const CURRICULUM_PACKS: CurriculumPack[] = [
  {
    id: "obec-math-2560-p4-mixed-operations",
    version: "1.0.0",
    title: "Exit Ticket: การบวก ลบ คูณ หารระคน",
    target: {
      subject: "คณิตศาสตร์",
      grade: "ป.4",
      standardCode: "ค 1.1",
      indicatorCode: "ค 1.1 ป.4/10",
      indicatorText: "หาผลลัพธ์การบวก ลบ คูณ หารระคนของจำนวนนับ และ 0",
      source: { ...SOURCE, pageReference: "หน้า 9 (PDF หน้า 17)" },
    },
    questions: [
      { id: "q1", prompt: "245,000 + 187,500 = ______", expectedAnswer: "432,500", solution: "245,000 + 187,500 = 432,500" },
      { id: "q2", prompt: "800,000 − 276,500 = ______", expectedAnswer: "523,500", solution: "800,000 − 276,500 = 523,500" },
      { id: "q3", prompt: "1,250 × 24 = ______", expectedAnswer: "30,000", solution: "1,250 × (20 + 4) = 25,000 + 5,000 = 30,000" },
      { id: "q4", prompt: "9,936 ÷ 24 = ______", expectedAnswer: "414", solution: "24 × 414 = 9,936 ดังนั้น 9,936 ÷ 24 = 414" },
      { id: "q5", prompt: "(125,000 + 75,000) × 3 = ______", expectedAnswer: "600,000", solution: "200,000 × 3 = 600,000" },
    ],
  },
  {
    id: "obec-math-2560-p5-percent-problems",
    version: "1.0.0",
    title: "Exit Ticket: โจทย์ปัญหาร้อยละ",
    target: {
      subject: "คณิตศาสตร์",
      grade: "ป.5",
      standardCode: "ค 1.1",
      indicatorCode: "ค 1.1 ป.5/9",
      indicatorText: "แสดงวิธีหาคำตอบของโจทย์ปัญหาร้อยละไม่เกิน 2 ขั้นตอน",
      source: { ...SOURCE, pageReference: "หน้า 11 (PDF หน้า 19)" },
    },
    questions: [
      { id: "q1", prompt: "20% ของ 250 เท่ากับเท่าไร", expectedAnswer: "50", solution: "20/100 × 250 = 50" },
      { id: "q2", prompt: "กระเป๋าราคา 400 บาท ลด 15% ต้องจ่ายกี่บาท", expectedAnswer: "340 บาท", solution: "ส่วนลด 15/100 × 400 = 60 บาท จึงจ่าย 400 − 60 = 340 บาท" },
      { id: "q3", prompt: "นักเรียน 40 คน ทำแบบฝึกถูก 75% มีกี่คนที่ทำถูก", expectedAnswer: "30 คน", solution: "75/100 × 40 = 30 คน" },
      { id: "q4", prompt: "สินค้า 500 บาท ปรับราคาเพิ่ม 7% ราคาใหม่เท่าไร", expectedAnswer: "535 บาท", solution: "เพิ่ม 7/100 × 500 = 35 บาท ราคาใหม่ 500 + 35 = 535 บาท" },
      { id: "q5", prompt: "ห้องสมุดมีหนังสือ 600 เล่ม เป็นนิยาย 30% แล้วรับบริจาคนิยายเพิ่ม 50 เล่ม ขณะนี้มีนิยายกี่เล่ม", expectedAnswer: "230 เล่ม", solution: "นิยายเดิม 30/100 × 600 = 180 เล่ม รวม 180 + 50 = 230 เล่ม" },
    ],
  },
  {
    id: "obec-math-2560-p6-ratio-scale",
    version: "1.0.0",
    title: "Exit Ticket: อัตราส่วนและมาตราส่วน",
    target: {
      subject: "คณิตศาสตร์",
      grade: "ป.6",
      standardCode: "ค 1.1",
      indicatorCode: "ค 1.1 ป.6/11",
      indicatorText: "แสดงวิธีหาคำตอบของโจทย์ปัญหาอัตราส่วน และมาตราส่วน",
      source: { ...SOURCE, pageReference: "หน้า 12 (PDF หน้า 20)" },
    },
    questions: [
      { id: "q1", prompt: "ลูกบอลสีแดง : สีน้ำเงิน = 2 : 3 มีทั้งหมด 25 ลูก มีลูกบอลสีแดงกี่ลูก", expectedAnswer: "10 ลูก", solution: "รวม 5 ส่วน แต่ละส่วนมี 25 ÷ 5 = 5 ลูก สีแดงมี 2 × 5 = 10 ลูก" },
      { id: "q2", prompt: "ข้าว : น้ำ = 2 : 3 ถ้าใช้ข้าว 8 ถ้วย ต้องใช้น้ำกี่ถ้วย", expectedAnswer: "12 ถ้วย", solution: "ข้าว 2 ส่วนเป็น 8 ถ้วย จึงมีส่วนละ 4 ถ้วย น้ำ 3 × 4 = 12 ถ้วย" },
      { id: "q3", prompt: "แผนที่มาตราส่วน 1 : 100,000 วัดระยะได้ 3 ซม. ระยะจริงกี่กิโลเมตร", expectedAnswer: "3 กิโลเมตร", solution: "3 × 100,000 = 300,000 ซม. = 3 กิโลเมตร" },
      { id: "q4", prompt: "แบบจำลองมาตราส่วน 1 : 50 ยาว 4 ซม. ของจริงยาวกี่เมตร", expectedAnswer: "2 เมตร", solution: "4 × 50 = 200 ซม. = 2 เมตร" },
      { id: "q5", prompt: "นักเรียนชาย : นักเรียนหญิง = 3 : 5 ถ้ามีนักเรียนหญิง 40 คน มีนักเรียนชายกี่คน", expectedAnswer: "24 คน", solution: "หญิง 5 ส่วนเป็น 40 คน จึงมีส่วนละ 8 คน ชาย 3 × 8 = 24 คน" },
    ],
  },
];

export function getCurriculumPack(packId: string): CurriculumPack | undefined {
  return CURRICULUM_PACKS.find((pack) => pack.id === packId);
}
