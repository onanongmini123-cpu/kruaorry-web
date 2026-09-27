(function () {
  "use strict";

  const content = window.RACE_CONTENT;
  if (!content || content.report.total < 40) {
    document.body.textContent = "เปิดคลังคำถามไม่สำเร็จ กรุณาโหลดหน้าใหม่";
    throw new Error("Question bank unavailable");
  }

  const TEAM_PRESETS = Object.freeze([
    Object.freeze({ name: "ทีมแมวแดง", animal: "🐱", vehicle: "🏎️", color: "#b91c1c" }),
    Object.freeze({ name: "ทีมกระต่ายน้ำเงิน", animal: "🐰", vehicle: "🚙", color: "#1d4ed8" }),
    Object.freeze({ name: "ทีมหมีเขียว", animal: "🐻", vehicle: "🚗", color: "#166534" }),
    Object.freeze({ name: "ทีมกบส้ม", animal: "🐸", vehicle: "🛻", color: "#c2410c" }),
  ]);
  const ALLOWED_CATEGORIES = Object.freeze(["mixed", "math", "number", "english"]);
  const ALLOWED_LEVELS = Object.freeze(["starter", "fluent"]);
  const ALLOWED_TIMERS = Object.freeze([0, 15, 30]);

  const elements = Object.freeze({
    setupScreen: document.querySelector("#setupScreen"),
    setupTitle: document.querySelector("#setupTitle"),
    setupForm: document.querySelector("#setupForm"),
    teamCount: document.querySelector("#teamCount"),
    roundCount: document.querySelector("#roundCount"),
    category: document.querySelector("#category"),
    level: document.querySelector("#level"),
    timer: document.querySelector("#timer"),
    teamFields: document.querySelector("#teamFields"),
    settingsButton: document.querySelector("#settingsButton"),
    gameScreen: document.querySelector("#gameScreen"),
    roundLabel: document.querySelector("#roundLabel"),
    track: document.querySelector("#track"),
    scoreboard: document.querySelector("#scoreboard"),
    turnStatus: document.querySelector("#turnStatus"),
    readyView: document.querySelector("#readyView"),
    turnHeading: document.querySelector("#turnHeading"),
    playerLabel: document.querySelector("#playerLabel"),
    readyButton: document.querySelector("#readyButton"),
    questionView: document.querySelector("#questionView"),
    questionCategory: document.querySelector("#questionCategory"),
    timerBox: document.querySelector("#timerBox"),
    timerText: document.querySelector("#timerText"),
    pauseButton: document.querySelector("#pauseButton"),
    questionVisual: document.querySelector("#questionVisual"),
    questionText: document.querySelector("#questionText"),
    choices: document.querySelector("#choices"),
    feedbackView: document.querySelector("#feedbackView"),
    feedbackIcon: document.querySelector("#feedbackIcon"),
    feedbackTitle: document.querySelector("#feedbackTitle"),
    feedbackAnswer: document.querySelector("#feedbackAnswer"),
    feedbackExplanation: document.querySelector("#feedbackExplanation"),
    continueButton: document.querySelector("#continueButton"),
    finishView: document.querySelector("#finishView"),
    finishTitle: document.querySelector("#finishTitle"),
    finishSummary: document.querySelector("#finishSummary"),
    podium: document.querySelector("#podium"),
    tieBreakButton: document.querySelector("#tieBreakButton"),
    newRaceButton: document.querySelector("#newRaceButton"),
  });

  let state = null;
  let timerHandle = null;
  let timerToken = 0;

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setView(node, visible) {
    node.hidden = !visible;
  }

  function boundedText(value, fallback, maxLength) {
    const text = String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
    return (text || fallback).slice(0, maxLength);
  }

  function parsePlayers(value) {
    const players = String(value ?? "")
      .split(/[,\n]/)
      .map((name) => boundedText(name, "", 24))
      .filter(Boolean)
      .slice(0, 12);
    return players.length ? players : ["ตัวแทนทีม"];
  }

  function teamEditorValues() {
    return [...elements.teamFields.querySelectorAll(".team-editor")].map((row) => ({
      name: row.querySelector("[data-team-name]")?.value || "",
      players: row.querySelector("[data-team-players]")?.value || "",
    }));
  }

  function renderTeamFields() {
    const count = Number(elements.teamCount.value);
    const previous = teamEditorValues();
    elements.teamFields.replaceChildren();
    TEAM_PRESETS.slice(0, count).forEach((preset, index) => {
      const editor = createElement("div", "team-editor");
      editor.style.setProperty("--team-color", preset.color);

      const nameLabel = createElement("label");
      const nameText = createElement("span", "", `${preset.animal} ชื่อทีม ${index + 1}`);
      const nameInput = createElement("input");
      nameInput.type = "text";
      nameInput.maxLength = 30;
      nameInput.value = previous[index]?.name || preset.name;
      nameInput.dataset.teamName = "";
      nameInput.setAttribute("aria-label", `ชื่อทีม ${index + 1}`);
      nameLabel.append(nameText, nameInput);

      const playerLabel = createElement("label");
      const playerText = createElement("span", "", "รายชื่อตัวแทน (ถ้ามี)");
      const playerInput = createElement("input");
      playerInput.type = "text";
      playerInput.maxLength = 220;
      playerInput.placeholder = "เช่น แก้ว, ต้น, เมย์";
      playerInput.value = previous[index]?.players || "";
      playerInput.dataset.teamPlayers = "";
      playerInput.setAttribute("aria-label", `รายชื่อตัวแทนทีม ${index + 1}`);
      playerLabel.append(playerText, playerInput);
      editor.append(nameLabel, playerLabel);
      elements.teamFields.append(editor);
    });
  }

  function freshSeed() {
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      return `${values[0].toString(36)}-${values[1].toString(36)}`;
    }
    return `${Date.now().toString(36)}-${performance.now().toFixed(3)}`;
  }

  function validateConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("ข้อมูลตั้งค่าไม่ถูกต้อง");
    if (!Array.isArray(config.teams) || config.teams.length < 2 || config.teams.length > 4) throw new Error("ต้องมี 2–4 ทีม");
    if (![5, 10].includes(config.rounds)) throw new Error("เลือกรอบ 5 หรือ 10 รอบ");
    if (!ALLOWED_CATEGORIES.includes(config.category)) throw new Error("หมวดคำถามไม่ถูกต้อง");
    if (!ALLOWED_LEVELS.includes(config.level)) throw new Error("ระดับไม่ถูกต้อง");
    if (!ALLOWED_TIMERS.includes(config.timerSeconds)) throw new Error("เวลาไม่ถูกต้อง");
    config.teams.forEach((team, index) => {
      if (!team || typeof team !== "object" || Array.isArray(team)) throw new Error(`ข้อมูลทีม ${index + 1} ไม่ถูกต้อง`);
      if (typeof team.name !== "string" || !team.name.trim()) throw new Error(`กรุณาใส่ชื่อทีม ${index + 1}`);
      if (!Array.isArray(team.players) || !team.players.length || team.players.some((name) => typeof name !== "string" || !name.trim())) throw new Error(`รายชื่อตัวแทนทีม ${index + 1} ไม่ถูกต้อง`);
    });
  }

  function configFromForm() {
    const count = Number(elements.teamCount.value);
    const rows = teamEditorValues().slice(0, count);
    return {
      teams: rows.map((row, index) => ({
        name: boundedText(row.name, TEAM_PRESETS[index].name, 30),
        players: parsePlayers(row.players),
      })),
      rounds: Number(elements.roundCount.value),
      category: elements.category.value,
      level: elements.level.value,
      timerSeconds: Number(elements.timer.value),
    };
  }

  function clearTimer() {
    timerToken += 1;
    if (timerHandle !== null) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function teamFromConfig(team, index) {
    const preset = TEAM_PRESETS[index];
    return {
      id: `team-${index + 1}`,
      name: boundedText(team.name, preset.name, 30),
      players: team.players.map((player) => boundedText(player, "ตัวแทนทีม", 24)).slice(0, 12),
      color: preset.color,
      animal: preset.animal,
      vehicle: preset.vehicle,
      score: 0,
      mainAttempts: 0,
      tieAttempts: 0,
      correct: 0,
    };
  }

  function validateSchedule(schedule, config) {
    if (!Array.isArray(schedule) || schedule.length !== config.rounds) throw new Error("ตารางคำถามไม่ครบจำนวนรอบ");
    const ids = new Set();
    schedule.forEach((round, roundIndex) => {
      if (!Array.isArray(round.questions) || round.questions.length !== config.teams.length) throw new Error(`คำถามรอบ ${roundIndex + 1} ไม่ครบทุกทีม`);
      if (new Set(round.questions.map((question) => `${question.category}|${question.level}|${question.pack}`)).size !== 1) throw new Error(`ความยากรอบ ${roundIndex + 1} ไม่สมดุล`);
      round.questions.forEach((question) => {
        if (ids.has(question.id)) throw new Error(`พบโจทย์ซ้ำ ${question.id}`);
        ids.add(question.id);
        if (question.choices.length !== 3 || new Set(question.choices).size !== 3) throw new Error(`ตัวเลือกไม่ถูกต้อง ${question.id}`);
        if (question.choices[question.correctIndex] !== question.answer) throw new Error(`เฉลยไม่ตรง ${question.id}`);
        if (String(content.deriveExpected(question.source)) !== String(question.answer)) throw new Error(`ตรวจคำตอบไม่ได้ ${question.id}`);
      });
    });
  }

  function startRace(rawConfig) {
    const config = {
      teams: rawConfig.teams.map((team, index) => ({
        name: boundedText(team.name, TEAM_PRESETS[index].name, 30),
        players: team.players.map((name) => boundedText(name, "ตัวแทนทีม", 24)).filter(Boolean).slice(0, 12),
      })),
      rounds: Number(rawConfig.rounds),
      category: String(rawConfig.category),
      level: String(rawConfig.level),
      timerSeconds: Number(rawConfig.timerSeconds),
    };
    config.teams.forEach((team) => { if (!team.players.length) team.players = ["ตัวแทนทีม"]; });
    validateConfig(config);
    const matchSeed = freshSeed();
    const schedule = content.buildSchedule({ ...config, teamCount: config.teams.length }, matchSeed);
    validateSchedule(schedule, config);
    clearTimer();
    state = {
      phase: "ready",
      mode: "main",
      config,
      matchSeed,
      schedule,
      tieSchedule: null,
      teams: config.teams.map(teamFromConfig),
      roundIndex: 0,
      currentTeamIndex: 0,
      currentQuestion: schedule[0].questions[0],
      turnResolved: false,
      feedback: null,
      secondsLeft: config.timerSeconds,
      paused: false,
      tieBreakUsed: false,
      tieLeaders: [],
      tieOrder: 0,
      finalWinnerIndexes: [],
    };
    setView(elements.setupScreen, false);
    setView(elements.gameScreen, true);
    elements.settingsButton.hidden = false;
    renderAll();
    focusSoon(elements.readyButton);
    return publicState();
  }

  function currentTeam() {
    return state.teams[state.currentTeamIndex];
  }

  function currentPlayer(team) {
    const turnCount = team.mainAttempts + team.tieAttempts;
    return team.players[turnCount % team.players.length];
  }

  function nextQuestion() {
    if (state.mode === "main") return state.schedule[state.roundIndex].questions[state.currentTeamIndex];
    return state.tieSchedule.questions[state.tieOrder];
  }

  function prepareReady() {
    clearTimer();
    state.phase = "ready";
    state.currentQuestion = nextQuestion();
    state.turnResolved = false;
    state.feedback = null;
    state.secondsLeft = state.config.timerSeconds;
    state.paused = false;
    renderAll();
    focusSoon(elements.readyButton);
  }

  function beginQuestion() {
    if (!state || state.phase !== "ready") throw new Error("ยังไม่ถึงเวลาของคำถามนี้");
    state.phase = "question";
    state.turnResolved = false;
    state.secondsLeft = state.config.timerSeconds;
    state.paused = false;
    renderAll();
    if (state.config.timerSeconds > 0) startCountdown();
    focusSoon(elements.questionText);
    return publicState();
  }

  function startCountdown() {
    clearTimer();
    if (!state || state.phase !== "question" || state.config.timerSeconds === 0 || state.paused) return;
    const token = timerToken;
    timerHandle = window.setInterval(() => {
      if (token !== timerToken || !state || state.phase !== "question" || state.turnResolved || state.paused) return;
      state.secondsLeft -= 1;
      renderTimer();
      if (state.secondsLeft <= 0) resolveTurn(null, "timeout");
    }, 1000);
  }

  function togglePause() {
    if (!state || state.phase !== "question" || state.config.timerSeconds === 0 || state.turnResolved) throw new Error("หยุดเวลาไม่ได้ในขณะนี้");
    state.paused = !state.paused;
    if (state.paused) clearTimer();
    else startCountdown();
    renderTimer();
    renderChoiceDisabled();
    focusSoon(elements.pauseButton);
    return publicState();
  }

  function resolveTurn(selectedIndex, reason) {
    if (!state || state.phase !== "question" || state.turnResolved || state.paused) throw new Error("ตานี้รับคำตอบไม่ได้");
    if (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 2)) throw new Error("ตัวเลือกต้องเป็นหมายเลข 0–2");
    state.turnResolved = true;
    clearTimer();
    const question = state.currentQuestion;
    const correct = selectedIndex !== null && selectedIndex === question.correctIndex;
    const team = currentTeam();
    if (state.mode === "main") team.mainAttempts += 1;
    else team.tieAttempts += 1;
    if (correct) {
      team.score += 2;
      team.correct += 1;
    }
    state.feedback = { correct, reason, selectedIndex };
    state.phase = "feedback";
    renderAll();
    focusSoon(elements.continueButton);
    return publicState();
  }

  function isLastPendingTurn() {
    if (state.mode === "main") return state.roundIndex === state.config.rounds - 1 && state.currentTeamIndex === state.teams.length - 1;
    return state.tieOrder === state.tieLeaders.length - 1;
  }

  function continueRace() {
    if (!state || state.phase !== "feedback") throw new Error("ยังไม่มีผลคำตอบให้ดำเนินการต่อ");
    if (state.mode === "main") {
      if (state.currentTeamIndex < state.teams.length - 1) {
        state.currentTeamIndex += 1;
        prepareReady();
      } else if (state.roundIndex < state.config.rounds - 1) {
        state.roundIndex += 1;
        state.currentTeamIndex = 0;
        prepareReady();
      } else {
        finishMainRace();
      }
    } else if (state.tieOrder < state.tieLeaders.length - 1) {
      state.tieOrder += 1;
      state.currentTeamIndex = state.tieLeaders[state.tieOrder];
      prepareReady();
    } else {
      finishTieBreak();
    }
    return publicState();
  }

  function leaderIndexes(indices) {
    const candidates = indices || state.teams.map((_, index) => index);
    const top = Math.max(...candidates.map((index) => state.teams[index].score));
    return candidates.filter((index) => state.teams[index].score === top);
  }

  function assertMainComplete() {
    if (!state.teams.every((team) => team.mainAttempts === state.config.rounds)) throw new Error("ยังตัดสินไม่ได้ เพราะทุกทีมยังตอบไม่ครบเท่ากัน");
  }

  function finishMainRace() {
    assertMainComplete();
    clearTimer();
    state.phase = "finished";
    state.mode = "main";
    state.finalWinnerIndexes = leaderIndexes();
    state.tieLeaders = [...state.finalWinnerIndexes];
    renderAll();
    focusSoon(state.finalWinnerIndexes.length > 1 ? elements.tieBreakButton : elements.newRaceButton);
  }

  function startTieBreak() {
    if (!state || state.phase !== "finished" || state.mode !== "main" || state.tieBreakUsed || state.tieLeaders.length < 2) throw new Error("เริ่มรอบพิเศษไม่ได้");
    assertMainComplete();
    state.tieBreakUsed = true;
    state.mode = "tie";
    state.tieOrder = 0;
    state.tieSchedule = content.buildTieBreak({ ...state.config, teamCount: state.teams.length }, state.matchSeed, state.tieLeaders);
    state.currentTeamIndex = state.tieLeaders[0];
    prepareReady();
    return publicState();
  }

  function finishTieBreak() {
    if (!state.tieLeaders.every((index) => state.teams[index].tieAttempts === 1)) throw new Error("ทีมที่เสมอยังตอบรอบพิเศษไม่ครบ");
    clearTimer();
    state.phase = "finished";
    state.mode = "tie";
    state.finalWinnerIndexes = leaderIndexes(state.tieLeaders);
    renderAll();
    focusSoon(elements.newRaceButton);
  }

  function resetToSetup(askConfirmation) {
    const progressed = state && state.phase !== "setup";
    if (askConfirmation && progressed && !window.confirm("ต้องการล้างคะแนนและกลับไปตั้งค่าใหม่ใช่ไหม?")) return false;
    clearTimer();
    state = null;
    setView(elements.setupScreen, true);
    setView(elements.gameScreen, false);
    elements.settingsButton.hidden = true;
    elements.turnStatus.textContent = "";
    focusSoon(elements.setupTitle);
    return true;
  }

  function focusSoon(node) {
    window.requestAnimationFrame(() => node?.focus({ preventScroll: false }));
  }

  function renderTrack() {
    elements.track.replaceChildren();
    const mainFinishScore = state.config.rounds * 2;
    const maxScore = mainFinishScore + 2;
    state.teams.forEach((team) => {
      const lane = createElement("div", "track-lane");
      lane.style.setProperty("--team-color", team.color);
      lane.setAttribute("aria-label", `${team.name} อยู่ที่ ${team.score} คะแนน เส้นชัยหลักอยู่ที่ ${mainFinishScore} คะแนน และมีทางรอบพิเศษอีก 2 ช่อง`);
      const cells = createElement("div", "lane-cells");
      cells.style.setProperty("--cell-count", String(maxScore));
      for (let i = 0; i < maxScore; i += 1) cells.append(createElement("span", "lane-cell"));
      const finish = createElement("span", "finish-line");
      finish.setAttribute("aria-hidden", "true");
      const mainFinish = createElement("span", "main-finish-line");
      mainFinish.style.left = `${((mainFinishScore / maxScore) * 100).toFixed(4)}%`;
      mainFinish.setAttribute("aria-hidden", "true");
      const extraZone = createElement("span", `extra-zone${state.tieBreakUsed ? " active" : ""}`);
      extraZone.style.width = `${((2 / maxScore) * 100).toFixed(4)}%`;
      extraZone.setAttribute("aria-hidden", "true");
      extraZone.append(createElement("small", "extra-label", "พิเศษ"));
      const car = createElement("div", "race-car");
      car.style.setProperty("--team-color", team.color);
      const ratio = maxScore ? Math.min(team.score / maxScore, 1) : 0;
      car.style.left = `${(ratio * 100).toFixed(4)}%`;
      car.style.transform = `translateX(-${(ratio * 100).toFixed(4)}%)`;
      const animal = createElement("span", "animal", team.animal);
      animal.setAttribute("aria-hidden", "true");
      const vehicle = createElement("span", "vehicle", team.vehicle);
      vehicle.setAttribute("aria-hidden", "true");
      const label = createElement("span", "car-label", team.name);
      car.append(animal, vehicle, label);
      lane.append(cells, extraZone, mainFinish, finish, car);
      elements.track.append(lane);
    });
  }

  function renderScoreboard() {
    elements.scoreboard.replaceChildren();
    elements.scoreboard.style.setProperty("--team-count", String(state.teams.length));
    state.teams.forEach((team, index) => {
      const current = state.phase !== "finished" && index === state.currentTeamIndex;
      const card = createElement("article", `score-card${current ? " current" : ""}`);
      card.style.setProperty("--team-color", team.color);
      if (current) card.setAttribute("aria-current", "true");
      card.append(createElement("p", "score-name", `${team.animal} ${team.name}`));
      const values = createElement("div", "score-values");
      const scoreBox = createElement("div");
      scoreBox.append(createElement("small", "", "คะแนน / ระยะรถ"), createElement("strong", "", String(team.score)));
      const progressBox = createElement("div");
      let progress = `${team.mainAttempts}/${state.config.rounds} รอบ`;
      if (state.tieBreakUsed && state.tieLeaders.includes(index)) progress += ` · พิเศษ ${team.tieAttempts}/1`;
      progressBox.append(createElement("small", "", "ความคืบหน้า"), createElement("strong", "", progress));
      values.append(scoreBox, progressBox);
      card.append(values);
      elements.scoreboard.append(card);
    });
  }

  function renderRoundLabel() {
    if (state.mode === "main") {
      elements.roundLabel.textContent = `รอบที่ ${state.roundIndex + 1} จาก ${state.config.rounds} · ทีม ${state.currentTeamIndex + 1}/${state.teams.length}`;
    } else {
      elements.roundLabel.textContent = `รอบพิเศษ · ทีมที่ ${state.tieOrder + 1} จาก ${state.tieLeaders.length}`;
    }
  }

  function turnSnapshot(team) {
    const main = `ตอบแล้ว ${team.mainAttempts}/${state.config.rounds} รอบ`;
    const tie = state.tieBreakUsed && state.tieLeaders.includes(state.currentTeamIndex) ? ` · พิเศษ ${team.tieAttempts}/1` : "";
    return `${team.animal} ${team.vehicle} ${team.name} · ${team.score} คะแนน · ${main}${tie}`;
  }

  function renderReady() {
    const team = currentTeam();
    elements.turnStatus.textContent = `${turnSnapshot(team)} · เตรียมตัว`;
    elements.turnHeading.textContent = `${team.animal} ${team.name}`;
    elements.playerLabel.textContent = `ตัวแทนรอบนี้: ${currentPlayer(team)}`;
    elements.readyButton.textContent = state.mode === "tie" ? "พร้อมตอบรอบพิเศษ" : "ทีมนี้พร้อมตอบ";
  }

  function renderQuestion() {
    const question = state.currentQuestion;
    elements.turnStatus.textContent = `${turnSnapshot(currentTeam())} · กำลังตอบ`;
    elements.questionCategory.textContent = content.categoryLabels[question.category];
    elements.questionVisual.textContent = question.visual || "❓";
    elements.questionVisual.setAttribute("role", "img");
    elements.questionVisual.setAttribute("aria-label", question.visualAlt || "ภาพประกอบคำถาม");
    elements.questionVisual.removeAttribute("aria-hidden");
    elements.questionText.textContent = question.prompt;
    elements.questionText.tabIndex = -1;
    elements.choices.replaceChildren();
    question.choices.forEach((choice, index) => {
      const button = createElement("button", "choice-button", `${String.fromCharCode(65 + index)}. ${choice}`);
      button.type = "button";
      button.dataset.choiceIndex = String(index);
      button.addEventListener("click", () => {
        try { resolveTurn(index, "answer"); } catch (error) { reportError(error); }
      });
      elements.choices.append(button);
    });
    renderTimer();
    renderChoiceDisabled();
  }

  function renderTimer() {
    if (!state || state.config.timerSeconds === 0) {
      elements.timerText.textContent = "ไม่จำกัดเวลา";
      elements.pauseButton.hidden = true;
      elements.timerBox.classList.remove("urgent", "paused");
      return;
    }
    elements.pauseButton.hidden = false;
    elements.pauseButton.textContent = state.paused ? "เล่นต่อ" : "หยุดเวลา";
    elements.timerText.textContent = state.paused ? `หยุดไว้ที่ ${state.secondsLeft} วินาที` : `เหลือ ${state.secondsLeft} วินาที`;
    elements.timerBox.classList.toggle("urgent", !state.paused && state.secondsLeft <= 5);
    elements.timerBox.classList.toggle("paused", state.paused);
  }

  function renderChoiceDisabled() {
    const disabled = !state || state.phase !== "question" || state.turnResolved || state.paused;
    elements.choices.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
  }

  function renderFeedback() {
    const question = state.currentQuestion;
    const feedback = state.feedback;
    const team = currentTeam();
    elements.turnStatus.textContent = `${turnSnapshot(team)} · ตอบแล้ว`;
    elements.feedbackView.classList.toggle("correct", feedback.correct);
    elements.feedbackView.classList.toggle("wrong", !feedback.correct);
    elements.feedbackIcon.textContent = feedback.correct ? "✅" : feedback.reason === "timeout" ? "⏱️" : "💡";
    elements.feedbackTitle.textContent = feedback.correct ? "ถูกต้อง! รถขยับ 2 ช่อง" : feedback.reason === "timeout" ? "หมดเวลา รถอยู่ที่เดิม" : "ยังไม่ถูก รถอยู่ที่เดิม";
    elements.feedbackAnswer.textContent = `คำตอบที่ถูก: ${question.answer}`;
    elements.feedbackExplanation.textContent = question.explanation;
    elements.continueButton.textContent = isLastPendingTurn() ? "ดูผลการแข่งขัน" : "ทีมถัดไปพร้อมแล้ว";
  }

  function renderFinish() {
    const winners = state.finalWinnerIndexes.map((index) => state.teams[index]);
    const names = winners.map((team) => team.name).join(" และ ");
    const tied = winners.length > 1;
    elements.turnStatus.textContent = "การแข่งขันจบแล้ว";
    elements.finishTitle.textContent = tied ? `ชนะร่วมกัน: ${names}` : `ผู้ชนะ: ${names}`;
    if (state.mode === "main" && tied) {
      elements.finishSummary.textContent = `ทุกทีมเล่นครบ ${state.config.rounds} รอบเท่ากัน และ ${winners.length} ทีมได้คะแนนสูงสุดเท่ากัน จะยอมรับผลชนะร่วมกันหรือแข่งรอบพิเศษหนึ่งรอบก็ได้`;
    } else if (state.mode === "tie" && tied) {
      elements.finishSummary.textContent = "จบรอบพิเศษแล้วคะแนนยังเท่ากัน จึงเป็นผู้ชนะร่วมกันตามกติกา";
    } else {
      elements.finishSummary.textContent = `ตัดสินหลังทุกทีมได้โอกาสครบเท่ากัน ผู้ชนะทำได้ ${winners[0].score} คะแนน`;
    }
    elements.podium.replaceChildren();
    const standings = [...state.teams]
      .map((team, index) => ({ team, index }))
      .sort((a, b) => b.team.score - a.team.score || a.index - b.index);
    standings.forEach(({ team, index }) => {
      const rank = 1 + standings.filter((entry) => entry.team.score > team.score).length;
      const shared = standings.filter((entry) => entry.team.score === team.score).length > 1;
      const rankLabel = shared ? `อันดับ ${rank} ร่วม` : `อันดับ ${rank}`;
      const row = createElement("div", `podium-row${state.finalWinnerIndexes.includes(index) ? " winner" : ""}`, `${rankLabel} · ${team.animal} ${team.name} — ${team.score} คะแนน`);
      elements.podium.append(row);
    });
    elements.tieBreakButton.hidden = !(state.mode === "main" && tied && !state.tieBreakUsed);
  }

  function renderAll() {
    if (!state) return;
    elements.gameScreen.dataset.teamCount = String(state.teams.length);
    renderRoundLabel();
    renderTrack();
    renderScoreboard();
    setView(elements.readyView, state.phase === "ready");
    setView(elements.questionView, state.phase === "question");
    setView(elements.feedbackView, state.phase === "feedback");
    setView(elements.finishView, state.phase === "finished");
    if (state.phase === "ready") renderReady();
    if (state.phase === "question") renderQuestion();
    if (state.phase === "feedback") renderFeedback();
    if (state.phase === "finished") renderFinish();
  }

  function publicState() {
    if (!state) return { phase: "setup", questionBank: content.report };
    const team = state.phase === "finished" ? null : currentTeam();
    const result = {
      phase: state.phase,
      mode: state.mode,
      round: state.mode === "main" ? state.roundIndex + 1 : "tie-break",
      totalRounds: state.config.rounds,
      currentTeam: team ? { name: team.name, player: currentPlayer(team), index: state.currentTeamIndex } : null,
      teams: state.teams.map((item) => ({
        name: item.name,
        score: item.score,
        mainAttempts: item.mainAttempts,
        tieAttempts: item.tieAttempts,
        roundsLeft: Math.max(state.config.rounds - item.mainAttempts, 0),
      })),
      timer: state.config.timerSeconds === 0 ? null : { secondsLeft: state.secondsLeft, paused: state.paused },
      tieBreakUsed: state.tieBreakUsed,
      winners: state.phase === "finished" ? state.finalWinnerIndexes.map((index) => state.teams[index].name) : [],
    };
    if (state.phase === "question") {
      result.question = { category: state.currentQuestion.category, prompt: state.currentQuestion.prompt, visual: state.currentQuestion.visual, choices: [...state.currentQuestion.choices] };
    }
    if (state.phase === "feedback") {
      result.feedback = { correct: state.feedback.correct, reason: state.feedback.reason, answer: state.currentQuestion.answer, explanation: state.currentQuestion.explanation };
    }
    return result;
  }

  function reportError(error) {
    console.error(error);
    elements.turnStatus.textContent = error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
  }

  elements.teamCount.addEventListener("change", renderTeamFields);
  elements.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try { startRace(configFromForm()); }
    catch (error) { window.alert(error instanceof Error ? error.message : "เริ่มเกมไม่สำเร็จ"); }
  });
  elements.readyButton.addEventListener("click", () => { try { beginQuestion(); } catch (error) { reportError(error); } });
  elements.pauseButton.addEventListener("click", () => { try { togglePause(); } catch (error) { reportError(error); } });
  elements.continueButton.addEventListener("click", () => { try { continueRace(); } catch (error) { reportError(error); } });
  elements.tieBreakButton.addEventListener("click", () => { try { startTieBreak(); } catch (error) { reportError(error); } });
  elements.newRaceButton.addEventListener("click", () => resetToSetup(false));
  elements.settingsButton.addEventListener("click", () => resetToSetup(true));
  window.addEventListener("beforeunload", clearTimer);

  renderTeamFields();
  console.info(`รถแข่งตอบไว: ตรวจคลังโจทย์ผ่าน ${content.report.total} ข้อ`);
})();
