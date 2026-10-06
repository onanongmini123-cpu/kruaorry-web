import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  filterDiscoveredResources,
  normalizeDiscoveryFilters,
  normalizeDiscoveryText,
  resourceDiscoveryHref,
  type DiscoverableResource,
} from "../resourceDiscovery";

type Item = DiscoverableResource & { id: string };

// A small catalogue shaped like the real one: Thai and English titles, every
// access tier, several delivery modes and grade ranges.
const catalogue: Item[] = [
  {
    id: "vocab-bomb",
    title: "กู้ระเบิดคำศัพท์",
    meta: "เว็บเกมคำศัพท์ · 48 คำ · 4 หมวด",
    description: "เกมภารกิจกู้ระเบิดคำศัพท์สำหรับผู้เรียนระดับประถม ฝึกคำศัพท์ภาษาอังกฤษ",
    category: "ภาษาอังกฤษ",
    tags: ["เกม", "คำศัพท์"],
    gradeLevels: ["p1", "p2", "p3", "p4", "p5", "p6"],
    isFree: true,
    accessMode: "public",
    deliveryMode: "web_app",
  },
  {
    id: "sentence-train",
    title: "Sentence Train",
    meta: "เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง",
    description: "Practise English sentence order with a train game. Grammar structures, questions and negatives.",
    category: "ภาษาอังกฤษ",
    tags: ["game", "sentence", "grammar"],
    gradeLevels: ["p2", "p3", "m1", "m2", "m3"],
    isFree: true,
    accessMode: "public",
    deliveryMode: "web_app",
  },
  {
    id: "grammar-boss",
    title: "Grammar Boss Battle — ศึกบอสไวยากรณ์",
    meta: "เว็บเกมไวยากรณ์ · 60 ข้อ",
    description: "ฝึกไวยากรณ์ภาษาอังกฤษด้วยการต่อสู้กับบอส",
    category: "ภาษาอังกฤษ",
    tags: ["เกม"],
    gradeLevels: ["m1", "m2", "m3"],
    isFree: true,
    accessMode: "authenticated",
    deliveryMode: "web_app",
  },
  {
    id: "fractions-sheet",
    title: "ชุดใบงานเศษส่วน ป.4 พร้อมเฉลย",
    meta: "ใบงาน 20 หน้า · พร้อมเฉลย",
    description: "แบบฝึกคณิตศาสตร์เรื่องเศษส่วน สำหรับนักเรียนประถมศึกษาปีที่ 4",
    category: "คณิตศาสตร์",
    tags: ["ใบงาน", "เศษส่วน"],
    gradeLevels: ["p4"],
    isFree: false,
    accessMode: "plans",
    deliveryMode: "file_download",
  },
  {
    id: "team-tool",
    title: "เครื่องมือสุ่มชื่อและจับกลุ่ม",
    meta: "เครื่องมือครู · เล่นได้ทั้งห้อง",
    description: "สุ่มชื่อนักเรียน จับกลุ่มเป็นทีม 3 คน และจับเวลาในห้องเรียน",
    category: "เครื่องมือครู",
    tags: ["เครื่องมือ"],
    gradeLevels: ["all"],
    isFree: false,
    accessMode: "plans",
    deliveryMode: "web_app",
  },
  {
    id: "circuit-lab",
    title: "ห้องทดลองวงจรไฟฟ้า",
    meta: "ทดลองออนไลน์ · 5 ภารกิจ",
    description: "สำรวจวงจรไฟฟ้าอย่างง่ายสำหรับวิทยาศาสตร์ชั้นมัธยมต้น",
    category: "วิทยาศาสตร์",
    tags: ["วิทยาศาสตร์"],
    gradeLevels: ["m1", "m2"],
    isFree: true,
    accessMode: "authenticated",
    deliveryMode: "web_app",
  },
  {
    id: "phonics-quest",
    title: "AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร",
    meta: "เว็บเกม · ใช้กล้องมือถือ",
    description: "ฝึกโฟนิกส์ ตัวอักษร A–Z และเสียงต้นคำ",
    category: "ภาษาอังกฤษ",
    tags: ["phonics", "เกม"],
    gradeLevels: ["kindergarten", "p1", "p2"],
    isFree: true,
    accessMode: "public",
    deliveryMode: "web_app",
  },
  {
    id: "science-soon",
    title: "สื่อวิทยาศาสตร์ชุดใหม่ (เตรียมเปิด)",
    meta: "เร็ว ๆ นี้",
    description: "กำลังเตรียมเนื้อหา",
    category: "วิทยาศาสตร์",
    tags: [],
    gradeLevels: ["p5"],
    isFree: false,
    accessMode: "locked",
    deliveryMode: "google_template",
  },
  {
    id: "listening",
    title: "Listening Detective",
    meta: "เว็บเกมฟัง · 30 ข้อ",
    description: "Listen and choose the right picture. Spelling and reading practice for primary students.",
    category: "ภาษาอังกฤษ",
    tags: ["listening", "ฟัง"],
    gradeLevels: ["p3", "p4"],
    isFree: true,
    accessMode: "public",
    deliveryMode: "web_app",
  },
];

const ids = (filters: Parameters<typeof filterDiscoveredResources>[1]) =>
  filterDiscoveredResources(catalogue, filters).map((resource) => (resource as Item).id);

describe("grade phrases people type", () => {
  const p3 = ids({ query: "ป.3" });

  it("finds the same resources for every way of writing ป.3", () => {
    expect(p3).toEqual(["vocab-bomb", "sentence-train", "listening"]);
    for (const phrase of [
      "ป3", "ป 3", "ป. 3", "ป .3", "ประถม 3", "ประถม3", "ประถมศึกษาปีที่ 3", "ประถมศึกษา ปีที่ 3",
      "ประถมศึกษาปี 3", "ชั้นประถมศึกษาปีที่ 3", "ชั้นป.3", "ป.๓", "ป๓", "ประถม ๓", "P3", "p.3", "P 3", "p. 3",
      "prathom 3", "Prathom3", "grade 3", "Grade3", "GRADE 3",
    ]) {
      expect(ids({ query: phrase }), phrase).toEqual(p3);
    }
  });

  it("does the same for ม.1 / มัธยม / M1 / grade 7", () => {
    const m1 = ids({ query: "ม.1" });
    expect(m1).toEqual(["sentence-train", "grammar-boss", "circuit-lab"]);
    for (const phrase of ["ม1", "ม 1", "ม. 1", "มัธยม 1", "มัธยมศึกษาปีที่ 1", "ชั้นมัธยมศึกษาปีที่ 1", "ม.๑", "M1", "m.1", "M 1", "mathayom 1", "Matthayom 1", "grade 7"]) {
      expect(ids({ query: phrase }), phrase).toEqual(m1);
    }
  });

  it("does not read the tail of a Thai word as a school year", () => {
    // "ทีม 3 คน" is in the team tool's description; it is not ม.3.
    expect(ids({ query: "ม.3" })).toEqual(["sentence-train", "grammar-boss"]);
    expect(ids({ query: "ม3" })).toEqual(["sentence-train", "grammar-boss"]);
  });

  it("does not read English words that end in p or m as a school year", () => {
    expect(normalizeDiscoveryText("step 3 item 2 mp3")).toBe("step 3 item 2 mp3");
    expect(normalizeDiscoveryText("grade 99 grade 0")).toBe("grade 99 grade 0");
  });

  it("understands early / late school stages", () => {
    expect(ids({ query: "ประถมต้น" })).toEqual(["vocab-bomb", "sentence-train", "phonics-quest", "listening"]);
    expect(ids({ query: "ประถมปลาย" })).toEqual(["vocab-bomb", "fractions-sheet", "science-soon", "listening"]);
    expect(ids({ query: "มัธยมต้น" })).toEqual(["sentence-train", "grammar-boss", "circuit-lab"]);
    expect(ids({ query: "ม.ต้น" })).toEqual(["sentence-train", "grammar-boss", "circuit-lab"]);
    expect(ids({ query: "อนุบาล" })).toEqual(["phonics-quest"]);
    expect(ids({ query: "มัธยมปลาย" })).toEqual([]);
  });

  it("matches nothing for school years that do not exist", () => {
    for (const phrase of ["ป.7", "ป.0", "ป.9", "ม.7", "ประถม 7", "grade 13"]) {
      expect(ids({ query: phrase }), phrase).toEqual([]);
    }
  });

  it("keeps the grade dropdown and the text search independent", () => {
    // The dropdown also keeps resources for every grade; the text search does not guess.
    expect(ids({ grade: "p3" })).toEqual(["vocab-bomb", "sentence-train", "team-tool", "listening"]);
    // Every online resource carries the type word "เกมและสื่อออนไลน์", so "เกม" keeps the team tool too.
    expect(ids({ grade: "p3", query: "เกม" })).toEqual(["vocab-bomb", "sentence-train", "team-tool", "listening"]);
    expect(ids({ grade: "p3", query: "ไวยากรณ์" })).toEqual(["sentence-train"]);
  });
});

describe("Thai and English words for the same thing", () => {
  it("English / อังกฤษ / ภาษาอังกฤษ find the same resources, in any case", () => {
    const english = ids({ query: "อังกฤษ" });
    expect(english).toEqual(["vocab-bomb", "sentence-train", "grammar-boss", "phonics-quest", "listening"]);
    for (const phrase of ["English", "english", "ENGLISH", "ภาษาอังกฤษ", "  EnGlIsH  "]) {
      expect(ids({ query: phrase }), phrase).toEqual(english);
    }
  });

  it("game / games / เกม / เกมส์", () => {
    // Every online resource is typed "เกมและสื่อออนไลน์" on its card, so the word finds all of them
    // (and never a file or a template).
    const games = ids({ query: "เกม" });
    expect(games).toEqual(["vocab-bomb", "sentence-train", "grammar-boss", "team-tool", "circuit-lab", "phonics-quest", "listening"]);
    expect(games).not.toContain("fractions-sheet");
    expect(games).not.toContain("science-soon");
    for (const phrase of ["game", "Game", "GAMES", "เกมส์"]) {
      expect(ids({ query: phrase }), phrase).toEqual(games);
    }
  });

  it("worksheet / work sheet / ใบงาน", () => {
    expect(ids({ query: "ใบงาน" })).toEqual(["fractions-sheet"]);
    for (const phrase of ["worksheet", "Worksheets", "WORKSHEET", "work sheet", "Work Sheets"]) {
      expect(ids({ query: phrase }), phrase).toEqual(["fractions-sheet"]);
    }
  });

  it("vocabulary / vocab / คำศัพท์ / ศัพท์ and the common Thai misspelling คำศัพย์", () => {
    const vocab = ids({ query: "คำศัพท์" });
    expect(vocab).toEqual(["vocab-bomb"]);
    for (const phrase of ["vocabulary", "VOCAB", "ศัพท์", "คำศัพย์"]) {
      expect(ids({ query: phrase }), phrase).toEqual(vocab);
    }
  });

  it("finds Thai-only resources from English words and the reverse", () => {
    expect(ids({ query: "grammar" })).toEqual(["sentence-train", "grammar-boss"]);
    expect(ids({ query: "ไวยากรณ์" })).toEqual(["sentence-train", "grammar-boss"]);
    expect(ids({ query: "science" })).toEqual(["circuit-lab", "science-soon"]);
    expect(ids({ query: "math" })).toEqual(["fractions-sheet"]);
  });
});

describe("mistyped English words", () => {
  it("finds grammar resources for common misspellings of grammar", () => {
    const grammar = ids({ query: "grammar" });
    expect(grammar.length).toBeGreaterThan(0);
    for (const typo of ["grammer", "gramar", "grammmar", "Grammer", "GRAMAR", "gramma", "grammarr"]) {
      expect(ids({ query: typo }), typo).toEqual(grammar);
    }
  });

  it("finds other resources despite one or two wrong letters in long words", () => {
    expect(ids({ query: "sentance" })).toContain("sentence-train");
    expect(ids({ query: "sentense" })).toContain("sentence-train");
    expect(ids({ query: "vocabulory" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "vocabulery" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "listenning" })).toContain("listening");
    expect(ids({ query: "detectve" })).toEqual(["listening"]);
    expect(ids({ query: "worksheat" })).toEqual(["fractions-sheet"]);
    expect(ids({ query: "phonic" })).toContain("phonics-quest");
  });

  it("does not turn unrelated or short words into matches", () => {
    // Words shorter than 6 letters are never corrected ("train" must not find "brain"), and
    // 4–5 letter near-misses stay misses.
    for (const word of ["elephant", "dinosaur", "bicycle", "train", "brain", "grain", "tram", "gaem", "xyz", "gramr"]) {
      // "train" is a real word in a title; the others must find nothing.
      const result = ids({ query: word });
      if (word === "train") expect(result).toEqual(["sentence-train"]);
      else expect(result, word).toEqual([]);
    }
  });
});

describe("multi-word search and spacing", () => {
  it("needs every word, in any order", () => {
    expect(ids({ query: "เกม ศัพท์" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "ศัพท์ เกม" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "game vocabulary" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "เกม ไวยากรณ์ ม.2" })).toEqual(["sentence-train", "grammar-boss"]);
    expect(ids({ query: "เกม คณิต" })).toEqual([]);
  });

  it("ignores extra, odd and invisible spacing", () => {
    for (const phrase of [
      "เกม   ศัพท์",
      "  เกม ศัพท์  ",
      "เกม\u3000ศัพท์",
      "เกม\u00a0ศัพท์",
      "เกม\tศัพท์",
      "เกม\nศัพท์",
      "เกม\u200bศัพท์ ",
      "เกม,ศัพท์",
      "เกม, ศัพท์",
      "เกม;ศัพท์",
      "เกม|ศัพท์",
    ]) {
      expect(ids({ query: phrase }), JSON.stringify(phrase)).toEqual(["vocab-bomb"]);
    }
  });

  it("splits a Thai phrase typed without spaces when the whole phrase is not found", () => {
    expect(ids({ query: "เกมคำศัพท์" })).toContain("vocab-bomb");
    expect(ids({ query: "ใบงานเศษส่วน" })).toEqual(["fractions-sheet"]);
    expect(ids({ query: "เกมคำศัพท์ป.3" })).toEqual(["vocab-bomb"]);
    expect(ids({ query: "เกมไวยากรณ์ม.1" })).toEqual(["sentence-train", "grammar-boss"]);
  });

  it("normalizes full-width letters and Thai digits", () => {
    expect(ids({ query: "ＥＮＧＬＩＳＨ" })).toEqual(ids({ query: "english" }));
    expect(normalizeDiscoveryText("๑๒๓")).toBe("123");
  });
});

describe("grade ranges and filler words", () => {
  it("treats a range like ป.4-6 as any grade in it", () => {
    const upper = ["vocab-bomb", "fractions-sheet", "science-soon", "listening"];
    expect(ids({ query: "ป.4-6" })).toEqual(upper);
    for (const phrase of ["ป.4–6", "ป.4 - 6", "ป.4-ป.6", "ป4-6", "ป.4—6", "ป.4 ถึง ป.6", "ป.4 ถึง 6", "P4-6", "p.4 to 6", "ป.6-4", "ประถม 4-6", "ป.๔-๖"]) {
      expect(ids({ query: phrase }), phrase).toEqual(upper);
    }
  });

  it("ranges cross from primary into secondary and combine with other words", () => {
    expect(ids({ query: "ป.5-ม.2" })).toEqual(["vocab-bomb", "sentence-train", "grammar-boss", "circuit-lab", "science-soon"]);
    expect(ids({ query: "ม.1-3" })).toEqual(["sentence-train", "grammar-boss", "circuit-lab"]);
    expect(ids({ query: "ไวยากรณ์ ม.1-3" })).toEqual(["sentence-train", "grammar-boss"]);
    expect(ids({ query: "ป.1-3 ไวยากรณ์" })).toEqual(["sentence-train"]);
  });

  it("ignores filler words around the real search", () => {
    const p3Games = ["vocab-bomb", "sentence-train", "listening"];
    expect(ids({ query: "game for p3" })).toEqual(p3Games);
    expect(ids({ query: "the game for grade 3" })).toEqual(p3Games);
    expect(ids({ query: "เกมสำหรับ ป.3" })).toEqual(p3Games);
    expect(ids({ query: "เกมสำหรับป.3" })).toEqual(p3Games);
    expect(ids({ query: "สื่อสำหรับ ป.3" })).toEqual(ids({ query: "ป.3" }));
    expect(ids({ query: "สื่อ ระดับชั้น ป.3" })).toEqual(ids({ query: "ป.3" }));
    expect(ids({ query: "ชั้น ป.3" })).toEqual(ids({ query: "ป.3" }));
  });

  it("still searches for the filler word when nothing else was typed", () => {
    const media = ids({ query: "สื่อ" });
    expect(media).toContain("vocab-bomb");
    expect(media).not.toContain("fractions-sheet");
    expect(ids({ query: "for" })).not.toHaveLength(catalogue.length);
  });

  it("reuses the searchable text of a resource and notices a different object", () => {
    const original = { ...catalogue[0] };
    expect(filterDiscoveredResources([original], { query: "ระเบิด" })).toHaveLength(1);
    expect(filterDiscoveredResources([original], { query: "ระเบิด" })).toHaveLength(1);
    // A changed copy is a new object, so it is read again (the app never edits a loaded resource in place).
    expect(filterDiscoveredResources([{ ...original, title: "ชื่อใหม่", description: "", meta: "", tags: [] }], { query: "ระเบิด" })).toHaveLength(0);
  });
});

describe("no result, filters together with search, and clearing", () => {
  it("returns an empty list (never throws) for words that match nothing", () => {
    for (const phrase of ["ไดโนเสาร์", "zzzzzz", "!!!", "???", "()", ".*", "%", "_", "'; drop table resources; --", "<script>alert(1)</script>", "😀", "ก".repeat(100)]) {
      expect(ids({ query: phrase }), phrase).toEqual([]);
    }
  });

  it("treats a search made only of separators or blanks as no search", () => {
    for (const phrase of ["", "   ", ",,,", "\u200b\u200b", "\t\n"]) {
      expect(ids({ query: phrase }), JSON.stringify(phrase)).toHaveLength(catalogue.length);
    }
  });

  it("combines the search with every filter and only ever narrows", () => {
    const everything = ids({});
    const search = ids({ query: "เกม" });
    const withGrade = ids({ query: "เกม", grade: "m1" });
    const withAccess = ids({ query: "เกม", access: "member" });
    const withType = ids({ query: "เกม", type: "online" });
    const withCategory = ids({ query: "เกม", category: "ภาษาอังกฤษ" });
    for (const narrowed of [search, withGrade, withAccess, withType, withCategory]) {
      expect(narrowed.every((id) => everything.includes(id))).toBe(true);
    }
    // Grade m1 also keeps the "all grades" team tool; the dropdown is not a text search.
    expect(withGrade).toEqual(["sentence-train", "grammar-boss", "team-tool", "circuit-lab"]);
    expect(withAccess).toEqual(["grammar-boss", "circuit-lab"]);
    expect(withType).toEqual(search);
    expect(withCategory).toEqual(["vocab-bomb", "sentence-train", "grammar-boss", "phonics-quest", "listening"]);
    expect(ids({ query: "เกม", grade: "m1", access: "member", type: "online", category: "ภาษาอังกฤษ" })).toEqual(["grammar-boss"]);
    expect(ids({ query: "เกม", grade: "m1", access: "pro" })).toEqual(["team-tool"]);
    expect(ids({ query: "เกม", grade: "p1", access: "pro", category: "ภาษาอังกฤษ" })).toEqual([]);
    expect(ids({ query: "ใบงาน", type: "online" })).toEqual([]);
    expect(ids({ query: "ใบงาน", type: "file", access: "pro", grade: "p4" })).toEqual(["fractions-sheet"]);
  });

  it("filters alone, then clears back to the full list", () => {
    expect(ids({ access: "pro" })).toEqual(["fractions-sheet", "team-tool"]);
    expect(ids({ access: "free" })).toEqual(["vocab-bomb", "sentence-train", "phonics-quest", "listening"]);
    expect(ids({ access: "member" })).toEqual(["grammar-boss", "circuit-lab"]);
    expect(ids({ type: "file" })).toEqual(["fractions-sheet"]);
    expect(ids({ type: "template" })).toEqual(["science-soon"]);
    expect(ids({ category: "วิทยาศาสตร์" })).toEqual(["circuit-lab", "science-soon"]);

    const cleared = { query: "", category: "", grade: "", access: "all" as const, type: "all" as const };
    expect(ids(cleared)).toHaveLength(catalogue.length);
    expect(activeFilterCount(cleared)).toBe(0);
    expect(resourceDiscoveryHref("/resources", cleared)).toBe("/resources");
    expect(resourceDiscoveryHref("/app", {})).toBe("/app");
  });

  it("drops unknown or hostile filter values instead of trusting them", () => {
    expect(normalizeDiscoveryFilters({
      grade: "p99",
      access: "admin" as never,
      type: "../etc" as never,
      category: "x".repeat(500),
      query: "y".repeat(500),
    })).toEqual({ query: "y".repeat(100), category: "x".repeat(100), grade: "", access: "all", type: "all" });
    // An unknown category simply matches nothing.
    expect(ids({ category: "ไม่มีวิชานี้" })).toEqual([]);
  });

  it("keeps the URL for a long search bounded and encoded", () => {
    const href = resourceDiscoveryHref("/resources", { query: "ก".repeat(300), grade: "p3", access: "free" });
    expect(href.startsWith("/resources?q=")).toBe(true);
    expect(decodeURIComponent(href.split("q=")[1].split("&")[0])).toHaveLength(100);
    expect(href).toContain("grade=p3");
    expect(href).toContain("access=free");
  });

  it("is quick on a few thousand resources with a multi-word search", () => {
    const many: Item[] = Array.from({ length: 3000 }, (_, index) => ({ ...catalogue[index % catalogue.length], id: `r-${index}` }));
    const started = performance.now();
    const found = filterDiscoveredResources(many, { query: "grammer เกม ม.2" });
    expect(found.length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
