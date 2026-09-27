(function () {
  "use strict";

  const CATEGORY_LABELS = Object.freeze({
    math: "บวก–ลบ",
    number: "จำนวนและแบบรูป",
    english: "คำศัพท์อังกฤษ",
  });
  const LEVEL_KEYS = Object.freeze(["starter", "fluent"]);
  const CATEGORY_KEYS = Object.freeze(Object.keys(CATEGORY_LABELS));
  const MAIN_PACKS = Object.freeze({ 5: [0, 1, 4, 5, 8], 10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const TIE_PACK = 10;
  const VERSION = "race-bank-1";

  function normalize(value) {
    return String(value).normalize("NFC").trim().toLowerCase();
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function placeAnswer(answer, distractors, position) {
    const unique = [...new Set(distractors.map(String).filter((item) => normalize(item) !== normalize(answer)))];
    if (unique.length < 2) throw new Error("ตัวลวงไม่ครบ 2 ตัวเลือก");
    const choices = unique.slice(0, 2);
    choices.splice(position, 0, String(answer));
    return { choices, correctIndex: position };
  }

  function numericChoices(answer, position) {
    const number = Number(answer);
    const candidates = [number - 1, number + 1, number - 2, number + 2].filter((value) => value >= 0 && value !== number);
    return placeAnswer(String(number), candidates.map(String), position);
  }

  function deriveExpected(source) {
    switch (source.type) {
      case "add": return String(source.left + source.right);
      case "sub": return String(source.left - source.right);
      case "next": return String(source.value + 1);
      case "previous": return String(source.value - 1);
      case "between": {
        if (source.right - source.left !== 2) throw new Error("โจทย์จำนวนระหว่างกลางไม่ถูกต้อง");
        return String(source.left + 1);
      }
      case "count": return String(source.items.length);
      case "max": return String(Math.max(...source.values));
      case "min": return String(Math.min(...source.values));
      case "step": return String(source.start + source.step * source.missingIndex);
      case "placeValue": return String(source.tens * 10 + source.ones);
      case "descending": return [...source.values].sort((a, b) => b - a).join(", ");
      case "vocab": return String(source.word);
      default: throw new Error(`ไม่รู้จักตัวตรวจคำตอบ ${source.type}`);
    }
  }

  const FLUENT_MATH = Object.freeze([
    [[8, 7], [9, 7], [8, 9], [9, 9]],
    [[14, 9], [15, 9], [16, 9], [17, 9]],
    [[11, 13], [12, 13], [14, 12], [15, 12]],
    [[34, 13], [36, 14], [38, 15], [39, 15]],
    [[16, 15], [17, 15], [18, 15], [19, 15]],
    [[41, 19], [42, 19], [43, 19], [44, 19]],
    [[22, 17], [23, 17], [24, 17], [25, 17]],
    [[53, 21], [55, 22], [57, 23], [59, 24]],
    [[28, 13], [29, 13], [27, 16], [26, 18]],
    [[62, 28], [63, 28], [64, 28], [65, 28]],
    [[34, 8], [35, 8], [36, 8], [37, 8]],
  ]);

  const STARTER_MATH = Object.freeze([
    [[2, 3], [1, 5], [3, 4], [2, 6]],
    [[7, 5], [8, 5], [9, 5], [10, 5]],
    [[7, 4], [6, 6], [8, 5], [9, 5]],
    [[15, 9], [16, 9], [17, 9], [18, 9]],
    [[8, 7], [9, 7], [8, 9], [9, 9]],
    [[14, 9], [15, 9], [16, 9], [17, 9]],
    [[5, 6], [6, 6], [5, 8], [6, 8]],
    [[13, 6], [14, 6], [15, 6], [16, 6]],
    [[4, 8], [5, 8], [6, 8], [7, 8]],
    [[18, 9], [17, 7], [16, 5], [15, 3]],
    [[11, 4], [12, 4], [13, 4], [14, 4]],
  ]);

  function makeMath(level, pack, slot) {
    const sourcePair = (level === "starter" ? STARTER_MATH : FLUENT_MATH)[pack][slot];
    const operation = pack % 2 === 0 ? "add" : "sub";
    const source = { type: operation, left: sourcePair[0], right: sourcePair[1] };
    const answer = deriveExpected(source);
    const position = (pack + slot + (level === "fluent" ? 1 : 0)) % 3;
    const placed = numericChoices(answer, position);
    const sign = operation === "add" ? "+" : "−";
    return {
      id: `math-${level}-${pack}-${slot}`,
      category: "math",
      level,
      pack,
      slot,
      skill: operation,
      prompt: `${source.left} ${sign} ${source.right} เท่ากับเท่าไร?`,
      visual: operation === "add" ? "➕" : "➖",
      visualAlt: operation === "add" ? "เครื่องหมายบวก" : "เครื่องหมายลบ",
      answer,
      explanation: `${source.left} ${sign} ${source.right} = ${answer}`,
      source,
      ...placed,
    };
  }

  function makeNumberSource(level, pack, slot) {
    const add = level === "starter" ? 0 : 20;
    switch (pack) {
      case 0: return { type: "next", value: [4, 7, 9, 12][slot] + add };
      case 1: return { type: "previous", value: [6, 9, 11, 14][slot] + add };
      case 2: {
        const left = [5, 8, 12, 16][slot] + add;
        return { type: "between", left, right: left + 2 };
      }
      case 3: {
        const count = [6, 7, 8, 9][slot] + (level === "starter" ? 0 : 4);
        return { type: "count", items: Array.from({ length: count }, () => "●") };
      }
      case 4: {
        const top = [7, 9, 12, 15][slot] + add;
        return { type: "max", values: [top, top - 3, top - 2] };
      }
      case 5: {
        const low = [13, 14, 19, 22][slot] + add;
        return { type: "min", values: [low, low + 4, low + 2] };
      }
      case 6: {
        const start = [2, 5, 8, 11][slot] + add;
        return { type: "step", start, step: 2, missingIndex: 2 };
      }
      case 7: return { type: "placeValue", tens: [2, 3, 4, 5][slot] + (level === "starter" ? 0 : 2), ones: [3, 4, 5, 6][slot] };
      case 8: {
        const start = [5, 10, 15, 20][slot] + add;
        return { type: "step", start, step: 5, missingIndex: 2 };
      }
      case 9: {
        const high = [18, 24, 31, 45][slot] + add;
        return { type: "descending", values: [high - 3, high, high - 1] };
      }
      default: {
        const top = [29, 34, 43, 55][slot] + add;
        return { type: "max", values: [top - 3, top, top - 2] };
      }
    }
  }

  function numberPrompt(source) {
    switch (source.type) {
      case "next": return { prompt: `จำนวนถัดจาก ${source.value} คือข้อใด?`, visual: "➡️" };
      case "previous": return { prompt: `จำนวนก่อน ${source.value} คือข้อใด?`, visual: "⬅️" };
      case "between": return { prompt: `${source.left}, ___, ${source.right} ควรเติมจำนวนใด?`, visual: "🔢" };
      case "count": return { prompt: "มีจุดทั้งหมดกี่จุด?", visual: source.items.join(" ") };
      case "max": return { prompt: `จำนวนใดมากที่สุดใน ${source.values.join(", ")}?`, visual: "📈" };
      case "min": return { prompt: `จำนวนใดน้อยที่สุดใน ${source.values.join(", ")}?`, visual: "📉" };
      case "step": {
        const a = source.start;
        const b = a + source.step;
        const d = a + source.step * 3;
        return { prompt: `${a}, ${b}, ___, ${d} ควรเติมจำนวนใด?`, visual: "🧩" };
      }
      case "placeValue": return { prompt: `${source.tens} สิบ กับ ${source.ones} หน่วย เป็นจำนวนใด?`, visual: "🧮" };
      case "descending": return { prompt: `ข้อใดเรียงจากมากไปน้อยได้ถูกต้อง: ${source.values.join(", ")}`, visual: "⬇️" };
      default: throw new Error("ชนิดคำถามจำนวนไม่ถูกต้อง");
    }
  }

  function makeNumber(level, pack, slot) {
    const source = makeNumberSource(level, pack, slot);
    const answer = deriveExpected(source);
    const position = (pack + slot + (level === "fluent" ? 2 : 0)) % 3;
    let placed;
    if (source.type === "descending") {
      const asc = [...source.values].sort((a, b) => a - b).join(", ");
      const mixed = [source.values[2], source.values[0], source.values[1]].join(", ");
      placed = placeAnswer(answer, [asc, mixed], position);
    } else {
      placed = numericChoices(answer, position);
    }
    const wording = numberPrompt(source);
    return {
      id: `number-${level}-${pack}-${slot}`,
      category: "number",
      level,
      pack,
      slot,
      skill: source.type,
      prompt: wording.prompt,
      visual: wording.visual,
      visualAlt: "ภาพประกอบโจทย์จำนวน",
      answer,
      explanation: `ตรวจตามแบบรูปหรือค่าประจำหลักแล้ว คำตอบคือ ${answer}`,
      source,
      ...placed,
    };
  }

  const VOCAB = Object.freeze({
    starter: [
      [["🐱", "cat", "แมว"], ["🐶", "dog", "สุนัข"], ["🐟", "fish", "ปลา"], ["🐦", "bird", "นก"]],
      [["🍎", "apple", "แอปเปิล"], ["🍌", "banana", "กล้วย"], ["🍊", "orange", "ส้ม"], ["🍇", "grape", "องุ่น"]],
      [["📘", "book", "หนังสือ"], ["✏️", "pencil", "ดินสอ"], ["📏", "ruler", "ไม้บรรทัด"], ["🎒", "bag", "กระเป๋า"]],
      [["🚗", "car", "รถยนต์"], ["🚌", "bus", "รถโดยสาร"], ["🚲", "bike", "จักรยาน"], ["🚆", "train", "รถไฟ"]],
      [["✋", "hand", "มือ"], ["👁️", "eye", "ตา"], ["👂", "ear", "หู"], ["👃", "nose", "จมูก"]],
      [["🔴", "red", "สีแดง"], ["🔵", "blue", "สีน้ำเงิน"], ["🟢", "green", "สีเขียว"], ["🟡", "yellow", "สีเหลือง"]],
      [["🍚", "rice", "ข้าว"], ["🥚", "egg", "ไข่"], ["🥛", "milk", "นม"], ["🍞", "bread", "ขนมปัง"]],
      [["☀️", "sun", "ดวงอาทิตย์"], ["🌙", "moon", "ดวงจันทร์"], ["⭐", "star", "ดาว"], ["☁️", "cloud", "เมฆ"]],
      [["🐄", "cow", "วัว"], ["🐖", "pig", "หมู"], ["🦆", "duck", "เป็ด"], ["🐎", "horse", "ม้า"]],
      [["🥤", "cup", "ถ้วย"], ["🛏️", "bed", "เตียง"], ["🚪", "door", "ประตู"], ["🪑", "chair", "เก้าอี้"]],
      [["⚽", "ball", "ลูกบอล"], ["🪁", "kite", "ว่าว"], ["🥁", "drum", "กลอง"], ["🤖", "robot", "หุ่นยนต์"]],
    ],
    fluent: [
      [["🐰", "rabbit", "กระต่าย"], ["🐸", "frog", "กบ"], ["🐢", "turtle", "เต่า"], ["🦁", "lion", "สิงโต"]],
      [["🥭", "mango", "มะม่วง"], ["🍉", "watermelon", "แตงโม"], ["🥥", "coconut", "มะพร้าว"], ["🍓", "strawberry", "สตรอว์เบอร์รี"]],
      [["👩‍🏫", "teacher", "ครู"], ["🧑‍🎓", "student", "นักเรียน"], ["🏫", "school", "โรงเรียน"], ["🧑‍🤝‍🧑", "friend", "เพื่อน"]],
      [["✈️", "plane", "เครื่องบิน"], ["🚤", "boat", "เรือ"], ["🚁", "helicopter", "เฮลิคอปเตอร์"], ["🛵", "scooter", "สกูตเตอร์"]],
      [["🦶", "foot", "เท้า"], ["🦷", "tooth", "ฟัน"], ["👄", "mouth", "ปาก"], ["🦵", "leg", "ขา"]],
      [["🟣", "purple", "สีม่วง"], ["🩷", "pink", "สีชมพู"], ["⚫", "black", "สีดำ"], ["⚪", "white", "สีขาว"]],
      [["🍜", "noodle", "บะหมี่"], ["🧀", "cheese", "ชีส"], ["🥕", "carrot", "แครอต"], ["🍯", "honey", "น้ำผึ้ง"]],
      [["🌧️", "rain", "ฝน"], ["🌈", "rainbow", "สายรุ้ง"], ["❄️", "snow", "หิมะ"], ["💨", "wind", "ลม"]],
      [["🐘", "elephant", "ช้าง"], ["🐯", "tiger", "เสือ"], ["🐒", "monkey", "ลิง"], ["🦒", "giraffe", "ยีราฟ"]],
      [["🪟", "window", "หน้าต่าง"], ["🕰️", "clock", "นาฬิกา"], ["🪞", "mirror", "กระจก"], ["🛋️", "sofa", "โซฟา"]],
      [["📷", "camera", "กล้องถ่ายรูป"], ["🎸", "guitar", "กีตาร์"], ["🔑", "key", "กุญแจ"], ["☂️", "umbrella", "ร่ม"]],
    ],
  });

  function makeEnglish(level, pack, slot) {
    const item = VOCAB[level][pack][slot];
    const otherWords = VOCAB[level][pack].filter((_, index) => index !== slot).map((entry) => entry[1]);
    const answer = item[1];
    const position = (pack + slot + (level === "fluent" ? 1 : 0)) % 3;
    const placed = placeAnswer(answer, [otherWords[(slot + 1) % otherWords.length], otherWords[(slot + 2) % otherWords.length]], position);
    const source = { type: "vocab", visual: item[0], word: item[1], thai: item[2] };
    return {
      id: `english-${level}-${pack}-${slot}`,
      category: "english",
      level,
      pack,
      slot,
      skill: "image-word",
      prompt: "ภาพนี้ตรงกับคำศัพท์ภาษาอังกฤษข้อใด?",
      visual: item[0],
      visualAlt: `ภาพ${item[2]}`,
      answer,
      explanation: `ภาพนี้คือ${item[2]} ภาษาอังกฤษเขียนว่า ${answer}`,
      source,
      ...placed,
    };
  }

  function buildBank() {
    const bank = [];
    for (const level of LEVEL_KEYS) {
      for (let pack = 0; pack <= TIE_PACK; pack += 1) {
        for (let slot = 0; slot < 4; slot += 1) {
          bank.push(makeMath(level, pack, slot));
          bank.push(makeNumber(level, pack, slot));
          bank.push(makeEnglish(level, pack, slot));
        }
      }
    }
    return bank;
  }

  function validateQuestions(bank) {
    const errors = [];
    const ids = new Set();
    const packMap = new Map();
    for (const question of bank) {
      if (ids.has(question.id)) errors.push(`รหัสซ้ำ: ${question.id}`);
      ids.add(question.id);
      if (!CATEGORY_KEYS.includes(question.category)) errors.push(`หมวดไม่ถูกต้อง: ${question.id}`);
      if (!LEVEL_KEYS.includes(question.level)) errors.push(`ระดับไม่ถูกต้อง: ${question.id}`);
      if (!Number.isInteger(question.pack) || question.pack < 0 || question.pack > TIE_PACK) errors.push(`pack ไม่ถูกต้อง: ${question.id}`);
      if (!Number.isInteger(question.slot) || question.slot < 0 || question.slot > 3) errors.push(`slot ไม่ถูกต้อง: ${question.id}`);
      if (!Array.isArray(question.choices) || question.choices.length !== 3) errors.push(`ตัวเลือกไม่ครบ: ${question.id}`);
      if (new Set(question.choices.map(normalize)).size !== 3) errors.push(`ตัวเลือกซ้ำ: ${question.id}`);
      if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 2) errors.push(`ตำแหน่งเฉลยไม่ถูกต้อง: ${question.id}`);
      if (normalize(question.choices[question.correctIndex]) !== normalize(question.answer)) errors.push(`เฉลยไม่ตรงตัวเลือก: ${question.id}`);
      if (normalize(deriveExpected(question.source)) !== normalize(question.answer)) errors.push(`ตัวตรวจคำนวณไม่ตรง: ${question.id}`);
      if (!question.explanation || !question.prompt) errors.push(`ข้อความไม่ครบ: ${question.id}`);
      if (question.source.type === "sub" && Number(question.answer) < 0) errors.push(`ผลลบติดลบ: ${question.id}`);
      const key = `${question.category}|${question.level}|${question.pack}`;
      const list = packMap.get(key) || [];
      list.push(question);
      packMap.set(key, list);
    }
    for (const [key, questions] of packMap.entries()) {
      if (questions.length !== 4) errors.push(`ชุด ${key} มี ${questions.length} ข้อ`);
      if (new Set(questions.map((q) => q.slot)).size !== 4) errors.push(`ชุด ${key} มีช่องซ้ำ`);
      if (new Set(questions.map((q) => normalize(q.answer))).size !== 4) errors.push(`ชุด ${key} มีคำตอบซ้ำ`);
    }
    if (bank.length < 40) errors.push("คลังโจทย์น้อยกว่า 40 ข้อ");
    if (errors.length) throw new Error(`ตรวจคลังโจทย์ไม่ผ่าน: ${errors.slice(0, 8).join(" | ")}`);
    return {
      total: bank.length,
      byCategory: Object.fromEntries(CATEGORY_KEYS.map((category) => [category, bank.filter((q) => q.category === category).length])),
      byLevel: Object.fromEntries(LEVEL_KEYS.map((level) => [level, bank.filter((q) => q.level === level).length])),
      packsPerCategoryLevel: 11,
      variantsPerPack: 4,
      version: VERSION,
    };
  }

  const bank = Object.freeze(buildBank().map((question) => Object.freeze({ ...question, choices: Object.freeze([...question.choices]), source: Object.freeze({ ...question.source }) })));
  const report = Object.freeze(validateQuestions(bank));

  function cloneWithPosition(question, desiredPosition) {
    const distractors = question.choices.filter((choice) => normalize(choice) !== normalize(question.answer));
    const placed = placeAnswer(question.answer, distractors, desiredPosition);
    return { ...question, ...placed };
  }

  function questionAt(category, level, pack, slot) {
    const question = bank.find((item) => item.category === category && item.level === level && item.pack === pack && item.slot === slot);
    if (!question) throw new Error(`ไม่พบโจทย์ ${category}/${level}/${pack}/${slot}`);
    return question;
  }

  function validateConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("ข้อมูลตั้งค่าไม่ถูกต้อง");
    if (!Number.isInteger(config.teamCount) || config.teamCount < 2 || config.teamCount > 4) throw new Error("จำนวนทีมต้องเป็น 2–4 ทีม");
    if (![5, 10].includes(config.rounds)) throw new Error("จำนวนรอบต้องเป็น 5 หรือ 10");
    if (![...CATEGORY_KEYS, "mixed"].includes(config.category)) throw new Error("หมวดคำถามไม่ถูกต้อง");
    if (!LEVEL_KEYS.includes(config.level)) throw new Error("ระดับไม่ถูกต้อง");
  }

  function categoryForRound(config, roundIndex) {
    if (config.category !== "mixed") return config.category;
    return CATEGORY_KEYS[roundIndex % CATEGORY_KEYS.length];
  }

  function buildSchedule(config, matchSeed) {
    validateConfig(config);
    const seedOffset = hashString(`${VERSION}|${matchSeed}|main`) % 4;
    const packs = MAIN_PACKS[config.rounds];
    return packs.map((pack, roundIndex) => {
      const category = categoryForRound(config, roundIndex);
      const questions = Array.from({ length: config.teamCount }, (_, teamIndex) => {
        const slot = (teamIndex + roundIndex + seedOffset) % 4;
        const base = questionAt(category, config.level, pack, slot);
        return cloneWithPosition(base, (roundIndex + teamIndex + seedOffset) % 3);
      });
      if (new Set(questions.map((q) => q.id)).size !== questions.length) throw new Error("พบโจทย์ซ้ำในรอบเดียวกัน");
      return { roundIndex, pack, category, questions };
    });
  }

  function buildTieBreak(config, matchSeed, leaderTeamIndexes) {
    validateConfig(config);
    if (!Array.isArray(leaderTeamIndexes) || leaderTeamIndexes.length < 2 || leaderTeamIndexes.length > config.teamCount) throw new Error("รายชื่อทีมรอบพิเศษไม่ถูกต้อง");
    if (new Set(leaderTeamIndexes).size !== leaderTeamIndexes.length) throw new Error("รายชื่อทีมรอบพิเศษซ้ำ");
    const category = categoryForRound(config, config.rounds);
    const seedOffset = hashString(`${VERSION}|${matchSeed}|tie`) % 4;
    const questions = leaderTeamIndexes.map((teamIndex, order) => {
      const slot = (order + config.rounds + seedOffset) % 4;
      const base = questionAt(category, config.level, TIE_PACK, slot);
      return cloneWithPosition(base, (order + seedOffset) % 3);
    });
    if (new Set(questions.map((q) => q.id)).size !== questions.length) throw new Error("พบโจทย์รอบพิเศษซ้ำ");
    return { category, pack: TIE_PACK, questions };
  }

  window.RACE_CONTENT = Object.freeze({
    bank,
    report,
    categoryLabels: CATEGORY_LABELS,
    buildSchedule,
    buildTieBreak,
    deriveExpected,
    validateQuestions,
    version: VERSION,
  });
})();
