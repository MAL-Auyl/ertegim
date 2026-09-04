const storySpeaker = document.getElementById("storySpeaker");
const storyKk = document.getElementById("storyKk");
const storyRu = document.getElementById("storyRu");
const nextBtn = document.getElementById("nextBtn");
const recordBtn = document.getElementById("recordBtn");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const thinkingDots = document.getElementById("thinkingDots");
const blockedFlash = document.getElementById("blockedFlash");
const resultEl = document.getElementById("result");
const transcriptEl = document.getElementById("transcript");
const metaEl = document.getElementById("meta");
const aiVerdictEl = document.getElementById("aiVerdict");
const player = document.getElementById("player");
const logEl = document.getElementById("log");
const resetBtn = document.getElementById("resetBtn");
const uploadRow = document.getElementById("uploadRow");
const fileInput = document.getElementById("fileInput");
const heroStage = document.getElementById("heroStage");
const heroVoice = document.getElementById("heroVoice");
const reportPanel = document.getElementById("reportPanel");
const reportDate = document.getElementById("reportDate");
const sceneStage = document.getElementById("sceneStage");
const berryOverlay = document.getElementById("berryOverlay");

// One background per hero, per design doc's "character + background switch
// independently" approach — not one image per story branch. Add an entry
// here as more scene art lands (e.g. owl once its background is generated).
const SCENE_BG = {
  fox: "/images/bg-fox.png",
  owl: "/images/bg-owl.jpg",
};

// Replay variety (no two sessions look identical, even with a scripted
// story bank): the fox's berry count and the owl's target word are picked
// at random per session instead of being hardcoded to "3" / "мысық". The
// background art (bg-fox.png) has hand-painted berries baked in for the
// original "3" case, so instead of swapping art per count we draw the
// berries as a DOM overlay on top of it — same approach the design doc
// already uses for "don't draw one asset per branch."
const NUM_KK = ["", "бір", "екі", "үш", "төрт", "бес"];
const NUM_RU = ["", "один", "два", "три", "четыре", "пять"];
function ruBerryWord(n) {
  if (n === 1) return "ягода";
  if (n >= 2 && n <= 4) return "ягоды";
  return "ягод";
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Percentage positions roughly inside the bush area of bg-fox.png (upper-left
// cluster of cream bush blobs). Values are approximate/artistic — precision
// doesn't matter for a handful of small dots.
const BERRY_SLOTS = [
  { left: "33%", top: "39%" },
  { left: "40%", top: "35%" },
  { left: "45%", top: "42%" },
  { left: "36%", top: "46%" },
  { left: "42%", top: "49%" },
];

let berryCount = 3;
function rerollBerries() {
  berryCount = 2 + Math.floor(Math.random() * 4); // 2..5, still countable for a 3-7yo
  const kkList = [];
  const ruList = [];
  for (let i = 1; i <= berryCount; i++) {
    kkList.push(NUM_KK[i]);
    ruList.push(NUM_RU[i]);
  }
  STORY.fox_reveal.kk = `Ештеңе етпейді! Бірге санайық: ${kkList.join(", ")}! ${capitalize(NUM_KK[berryCount])} жидек екен!`;
  STORY.fox_reveal.ru = `Не страшно! Давай посчитаем вместе: ${ruList.join(", ")}! ${capitalize(NUM_RU[berryCount])} ${ruBerryWord(berryCount)}!`;
  STORY.fox_question.criterion =
    `Правильный ответ — число ${NUM_RU[berryCount]} (${berryCount}). Засчитывай верным любое произношение ` +
    `этого числа на казахском («${NUM_KK[berryCount]}») или русском («${NUM_RU[berryCount]}», «${berryCount}», ` +
    `«${berryCount} ${ruBerryWord(berryCount)}» и т.п.). Всё остальное (другое число, молчание не по теме, ` +
    `посторонний ответ) — неверно.`;
}

function renderBerryOverlay(show) {
  if (!show) {
    berryOverlay.innerHTML = "";
    berryOverlay.classList.remove("show");
    return;
  }
  berryOverlay.innerHTML = BERRY_SLOTS.slice(0, berryCount)
    .map((p) => `<span class="berry" style="left:${p.left};top:${p.top}"></span>`)
    .join("");
  berryOverlay.classList.add("show");
}

// Two source words for the owl's rhyme question — both real Kazakh words
// ending in "-ық", the same rhyme family as the reveal example "қасық"
// (ложка), so onReveal never needs to change no matter which is picked.
const OWL_WORDS = [
  { kk: "Мысық", kkLower: "мысық", ru: "кот" },
  { kk: "Балық", kkLower: "балық", ru: "рыба" },
];
let rhymeWord = OWL_WORDS[0];
function rerollRhymeWord() {
  rhymeWord = OWL_WORDS[Math.floor(Math.random() * OWL_WORDS.length)];
  STORY.owl_question.kk = `${rhymeWord.kk} — деп айттым. Осыған ұйқас сөз тап!`;
  STORY.owl_question.ru = `Я сказал «${rhymeWord.kkLower}» (${rhymeWord.ru}). Найди слово, похожее по звучанию!`;
  STORY.owl_question.criterion =
    `Правильный ответ — любое существующее казахское или русское слово, фонетически похожее на ` +
    `«${rhymeWord.kkLower}» (например, оканчивается на «-ық»/«-ик», как «қасық»). Не обязательно именно ` +
    `«қасық» — любая настоящая рифма/созвучие засчитывается верной. Слово без всякого созвучия или ` +
    `посторонний ответ — неверно.`;
}

async function playWithTimeout(ms) {
  const playTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`play() timed out after ${ms}ms`)), ms),
  );
  await Promise.race([heroVoice.play(), playTimeout]);
}

// Next Steps #7: pre-rendered fallback audio (spike/prerender.js output,
// served from /audio/<stateId>.wav) — stage-risk hedge in case live Piper
// or the request itself lags. Live call gets a short leash (2.5s); on any
// failure or timeout we fall back to the static file for that state.
async function speakLine(text, stateId) {
  if (!text) return;
  try {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(abortTimer);
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    const ms = res.headers.get("X-Synth-Ms");
    const blob = await res.blob();
    heroVoice.src = URL.createObjectURL(blob);
    // play() can hang indefinitely instead of rejecting in some browser/
    // automation contexts — never let audio playback stall the demo.
    await playWithTimeout(3000);
    log(`voice: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}" (${ms}ms synth)`);
  } catch (err) {
    if (stateId) {
      try {
        heroVoice.src = `/audio/${stateId}.wav`;
        await playWithTimeout(3000);
        log(`voice: fallback pre-rendered audio for "${stateId}" (live TTS: ${err.message})`);
        return;
      } catch (fallbackErr) {
        log(`voice error, fallback also failed: ${fallbackErr.message}`);
        return;
      }
    }
    // Non-fatal — the WoZ operator still has the on-screen text either way.
    log(`voice error (text still shown): ${err.message}`);
  }
}

let mediaRecorder = null;
let currentMimeType = "";
let recordingStartedAt = 0;
let chunks = [];
let recording = false;

// --- story state ---
let currentId = null;
let reaskUsed = false; // per-question: only one re-ask before auto-reveal (design doc "third strike")
// fox_reask/owl_reask loop back into the SAME question id, which used to
// re-trigger the "reaskUsed = false" reset below on every re-render —
// making the second consecutive re-ask (the auto-reveal trigger)
// unreachable. Only reset when the question is genuinely a new one.
let activeQuestionId = null;
let storyEnded = false;

function log(msg) {
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(line);
}

function renderState(id) {
  currentId = id;
  // Reroll BEFORE reading `s` below — `s` is just a reference into STORY,
  // so mutating STORY[id].kk/ru/criterion here still lands before anything
  // reads them. Only reroll on a genuinely new question, not a re-ask
  // loop-back (fox_reask/owl_reask return to the SAME question id) — the
  // child should recount the same bush, not a bush that changed underneath
  // them. Mirrors the activeQuestionId check below, evaluated early.
  if (id === "fox_question" && activeQuestionId !== id) rerollBerries();
  if (id === "owl_question" && activeQuestionId !== id) rerollRhymeWord();
  const s = STORY[id];

  cancelAiAutoAdvance();
  aiVerdictEl.classList.remove("show");
  blockedFlash.classList.remove("show", "materialize-in");
  resultEl.classList.remove("show", "materialize-in");
  statusText.textContent = "";
  thinkingDots.hidden = true;

  if (id === "parent_report") {
    storySpeaker.textContent = "";
    storyKk.textContent = "";
    storyRu.textContent = "";
    heroStage.innerHTML = "";
    sceneStage.classList.add("hidden");
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    reportDate.textContent = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
    reportPanel.classList.add("show", "materialize-in");
    log(`→ ${id}: мок-отчёт родителю (статичные цифры, Next Steps #6)`);
    return;
  }
  reportPanel.classList.remove("show", "materialize-in");
  sceneStage.classList.remove("hidden");

  const hero = HERO_FOR_STATE[id] || { character: "fox" };
  const bg = SCENE_BG[hero.character];
  sceneStage.style.backgroundImage = bg ? `url(${bg})` : "none";
  heroStage.classList.toggle("pose-happy", hero.pose === "happy");
  renderBerryOverlay(hero.character === "fox" && (id === "fox_question" || id === "fox_reask" || id === "fox_reveal"));

  storySpeaker.textContent = s.speaker;
  storyKk.textContent = s.kk;
  storyRu.textContent = s.ru;
  heroStage.innerHTML = renderHero(id);
  if (hero.character === "fox") animateFoxPose(heroStage, hero.pose);
  speakLine(s.kk, id);

  if (s.kind === "narration") {
    nextBtn.style.display = "block";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
  } else if (s.kind === "question") {
    nextBtn.style.display = "none";
    recordBtn.style.display = "block";
    recordBtn.disabled = false;
    uploadRow.style.display = "block";
    if (activeQuestionId !== id) {
      reaskUsed = false;
      activeQuestionId = id;
    }
  } else {
    // "end"
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    statusText.textContent = "Демо завершено.";
  }

  log(`→ ${id}: "${s.kk || "(нет текста)"}"`);
}

nextBtn.addEventListener("click", () => {
  const s = STORY[currentId];
  if (s.next) renderState(s.next);
});

resetBtn.addEventListener("click", () => {
  storyEnded = false;
  activeQuestionId = null;
  renderState(START_STATE);
  log("── сброс сценария ──");
});

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const hint = {
      NotFoundError: "микрофон не найден — проверь Параметры Windows → Звук → Ввод",
      NotAllowedError: "доступ к микрофону запрещён — проверь разрешения сайта и Windows",
      NotReadableError: "микрофон занят другим приложением",
    }[err.name] || err.message;
    statusText.textContent = `Микрофон недоступен: ${hint}`;
    log(`mic error: ${err.name} — ${hint}`);
    return;
  }
  chunks = [];
  // Safari (iOS) doesn't support WebM recording at all — it silently
  // records into audio/mp4 instead while MediaRecorder(stream) with no
  // options still "succeeds". Blindly labeling the result as audio/webm
  // (the old code) produces a Blob that's neither playable locally nor
  // decodable correctly server-side — garbage in, garbage out of Whisper.
  const mimeType = pickMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  currentMimeType = mediaRecorder.mimeType || mimeType || "audio/webm";
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = onRecordingStop;
  mediaRecorder.start();
  recordingStartedAt = Date.now();
  recording = true;
  recordBtn.textContent = "⏹ Стоп";
  recordBtn.classList.add("recording", "pulse");
  statusText.textContent = "Идёт запись...";
  blockedFlash.classList.remove("show", "materialize-in");
  resultEl.classList.remove("show", "materialize-in");
  cancelAiAutoAdvance();
  aiVerdictEl.classList.remove("show");
}

function stopRecording() {
  mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
  mediaRecorder?.stop();
  recording = false;
  recordBtn.textContent = "🎙 Записать ответ";
  recordBtn.classList.remove("recording", "pulse");
}

const MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/aac", "audio/wav"];
function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function extFromMime(mime) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

const MIN_RECORDING_MS = 600; // below this, Whisper tends to hallucinate on near-empty audio

async function onRecordingStop() {
  const elapsed = Date.now() - recordingStartedAt;
  if (elapsed < MIN_RECORDING_MS) {
    statusText.textContent = "Слишком коротко — нажми «Записать» и скажи ответ, потом «Стоп»";
    log(`recording skipped: only ${elapsed}ms (min ${MIN_RECORDING_MS}ms)`);
    return;
  }
  const mime = currentMimeType || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  await submitAudio(blob, `clip.${extFromMime(mime)}`);
}

async function submitAudio(blob, filename) {
  if (!blob || blob.size === 0) {
    statusText.textContent = "Запись пустая — попробуй ещё раз";
    log("submitAudio: skipped, empty blob (0 bytes)");
    recordBtn.disabled = false;
    fileInput.disabled = false;
    return;
  }

  player.src = URL.createObjectURL(blob);

  recordBtn.disabled = true;
  fileInput.disabled = true;
  statusText.textContent = "Распознаю";
  thinkingDots.hidden = false;

  const form = new FormData();
  form.append("audio", blob, filename);

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    statusText.textContent = "";
    thinkingDots.hidden = true;
    transcriptEl.textContent = data.transcript || "(тишина / не распознано)";
    metaEl.textContent = `${data.ms} ms · ${data.engine === "groq" ? "Groq" : "локальный Whisper (fallback)"}`;

    if (data.blocked) {
      blockedFlash.classList.add("show", "materialize-in");
      storyEnded = true;
      recordBtn.style.display = "none";
      uploadRow.style.display = "none";
      log(`BLOCKED (автоматически, без оператора): "${data.transcript}" — сценарий остановлен`);
    } else {
      resultEl.classList.add("show", "materialize-in");
      log(`transcript: "${data.transcript}" (${data.ms}ms)`);
      classifyAndSuggest(data.transcript);
    }
  } catch (err) {
    statusText.textContent = `Ошибка: ${err.message}`;
    thinkingDots.hidden = true;
    log(`error: ${err.message}`);
  } finally {
    recordBtn.disabled = false;
    fileInput.disabled = false;
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  log(`загружен файл: ${file.name}`);
  await submitAudio(file, file.name);
  fileInput.value = "";
});

recordBtn.addEventListener("click", () => {
  if (recording) stopRecording();
  else startRecording();
});

function advanceFromQuestion(nextId) {
  resultEl.classList.remove("show", "materialize-in");
  recordBtn.disabled = false;
  renderState(nextId);
}

// AI classifier (Next Steps #5): on every answered question we ask
// /api/classify for a verdict and auto-advance the story after a short
// countdown — but any manual button press cancels the pending auto-advance
// and takes over, so the operator keeps a hard kill-switch if the model
// misjudges or the call fails/times out (fail-open, see server.js comment
// above classifyAnswer()).
let aiAutoAdvanceTimer = null;
const AI_AUTO_ADVANCE_MS = 2500;

function cancelAiAutoAdvance() {
  if (aiAutoAdvanceTimer) {
    clearTimeout(aiAutoAdvanceTimer);
    aiAutoAdvanceTimer = null;
  }
}

function markCorrect(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log(`${source}: ВЕРНО`);
  advanceFromQuestion(s.onCorrect);
}

function markReask(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  if (!reaskUsed) {
    reaskUsed = true;
    log(`${source}: ПЕРЕСПРОСИТЬ (1-я попытка)`);
    advanceFromQuestion(s.onReask);
  } else {
    log(`${source}: ПЕРЕСПРОСИТЬ второй раз → авто-раскрытие (third strike)`);
    advanceFromQuestion(s.onReveal);
  }
}

async function classifyAndSuggest(transcript) {
  const s = STORY[currentId];
  if (s.kind !== "question" || !s.criterion) return;
  aiVerdictEl.className = "ai-verdict show";
  aiVerdictEl.innerHTML = `<span class="label">🤖 ИИ думает…</span>`;

  let data;
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, questionKk: s.kk, criterion: s.criterion }),
    });
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  } catch (err) {
    // Fail open: no verdict shown, operator uses the buttons as before.
    aiVerdictEl.classList.remove("show");
    log(`ИИ-классификатор недоступен (ручной режим): ${err.message}`);
    return;
  }

  const labelText = { correct: "✅ ВЕРНО", incorrect: "❌ НЕВЕРНО", unclear: "🔁 НЕ ПОНЯЛ / ПЕРЕСПРОСИТЬ" }[data.label];
  aiVerdictEl.className = `ai-verdict show ${data.label}`;
  aiVerdictEl.innerHTML = `
    <span class="label">🤖 ИИ: ${labelText}</span>
    <span class="reason">${data.reason || ""} (${data.ms}ms)</span>
    <span class="countdown">Авто-переход через ${(AI_AUTO_ADVANCE_MS / 1000).toFixed(1)}с — нажми кнопку, чтобы отменить</span>
  `;
  log(`ИИ: ${data.label} — "${data.reason}" (${data.ms}ms)`);

  cancelAiAutoAdvance();
  aiAutoAdvanceTimer = setTimeout(() => {
    aiAutoAdvanceTimer = null;
    if (data.label === "correct") markCorrect("ИИ (авто)");
    else markReask("ИИ (авто)");
  }, AI_AUTO_ADVANCE_MS);
}

document.getElementById("btnCorrect").addEventListener("click", () => markCorrect("оператор"));
document.getElementById("btnReask").addEventListener("click", () => markReask("оператор"));

document.getElementById("btnAdvance").addEventListener("click", () => {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log("оператор: ADVANCE (форс, STT-килл-свитч) → как «верно»");
  advanceFromQuestion(s.onCorrect);
});

// boot — the very first speakLine() call must happen inside a real user
// gesture (a tap), or iOS Safari silently blocks audio playback (no
// permission dialog, just a rejected play() promise). Every other
// renderState() call in the app already runs inside a click handler;
// this "Бастау" gate makes the first one no exception.
const startOverlay = document.getElementById("startOverlay");
document.getElementById("startBtn").addEventListener("click", () => {
  startOverlay.style.display = "none";
  renderState(START_STATE);
});
