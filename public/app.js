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
const pipelineStageEls = {
  mic: document.getElementById("stage-mic"),
  stt: document.getElementById("stage-stt"),
  safety: document.getElementById("stage-safety"),
  classify: document.getElementById("stage-classify"),
  tts: document.getElementById("stage-tts"),
};
// Dev-лог пайплайна: живой статус каждого шага на экране оператора
// (IDEA.md "Что нужно закрыть", P2) — отдельно от текстового #log ниже,
// чтобы на репетиции сразу было видно глазами, какой шаг завис/упал,
// без чтения строк.
function setStage(id, status, detail = "") {
  const el = pipelineStageEls[id];
  if (!el) return;
  el.className = `stage ${status}`;
  el.querySelector(".stage-detail").textContent = detail;
}
function resetTurnStages() {
  setStage("stt", "idle", "");
  setStage("safety", "idle", "");
  setStage("classify", "idle", "");
}
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
  setStage("tts", "running", "");
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
    setStage("tts", "ok", `${ms}ms live`);
  } catch (err) {
    if (stateId) {
      try {
        heroVoice.src = `/audio/${stateId}.wav`;
        await playWithTimeout(3000);
        log(`voice: fallback pre-rendered audio for "${stateId}" (live TTS: ${err.message})`);
        setStage("tts", "skip", "fallback wav");
        return;
      } catch (fallbackErr) {
        log(`voice error, fallback also failed: ${fallbackErr.message}`);
        setStage("tts", "err", "live + fallback failed");
        return;
      }
    }
    // Non-fatal — the WoZ operator still has the on-screen text either way.
    log(`voice error (text still shown): ${err.message}`);
    setStage("tts", "err", err.message);
  }
}

let mediaRecorder = null;
let currentMimeType = "";
let recordingStartedAt = 0;
let chunks = [];
let recording = false;

// --- Automatic voice turn-taking (VAD) --------------------------------
// The child shouldn't need to press anything (design doc "Детский экран
// без интерфейса" / "Никакой кнопки"): the mic is armed for the whole
// duration a question is on screen, speech start/end is detected locally
// from amplitude, and the clip auto-submits after a short silence. The
// manual recordBtn stays wired up as an operator override/kill-switch —
// same pattern as btnAdvance elsewhere in this file — for when a mic can't
// trip the VAD threshold or Web Audio itself is unavailable.
let vadStream = null;
let vadAudioCtx = null;
let vadAnalyser = null;
let vadFloatBuf = null;
let vadFrameId = null;
let vadRecorder = null;
let vadRecordStream = null; // separate getUserMedia stream, dedicated to MediaRecorder only
let vadRecording = false;
let vadArmed = false; // true only while the current question hasn't been answered yet
let vadSpeechStartedAt = 0;
let vadLastLoudAt = 0;

const VAD_START_RMS = 0.035; // amplitude that counts as "speech began" (raised from 0.02 — phone mic AGC was tripping this on ambient noise, self-triggering empty/garbage turns)
const VAD_SILENCE_RMS = 0.02; // lower bar to still count as "mid-speech" (hysteresis, avoids chatter at the threshold)
const VAD_SILENCE_MS = 1700; // pause this long after speech means "child is done" (raised from 1000ms — was cutting answers off mid-count, e.g. between "бір... екі...")
const VAD_MIN_SPEECH_MS = 400; // ignore blips shorter than this (cough, mic bump)
const VAD_MAX_RECORD_MS = 10000; // hard cap so a held-open mic can't stall the demo indefinitely (raised from 8000ms to match the longer silence tolerance)

async function ensureMicStream() {
  if (vadStream) return vadStream;
  vadStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  vadAudioCtx = new AudioCtx();
  const source = vadAudioCtx.createMediaStreamSource(vadStream);
  vadAnalyser = vadAudioCtx.createAnalyser();
  vadAnalyser.fftSize = 1024;
  vadFloatBuf = new Float32Array(vadAnalyser.fftSize);
  source.connect(vadAnalyser);
  return vadStream;
}

function currentRMS() {
  vadAnalyser.getFloatTimeDomainData(vadFloatBuf);
  let sum = 0;
  for (let i = 0; i < vadFloatBuf.length; i++) sum += vadFloatBuf[i] * vadFloatBuf[i];
  return Math.sqrt(sum / vadFloatBuf.length);
}

// --- Hero rendering: Rive-first for the fox, DOM-rebuild fallback otherwise ---
// Rive drives the fox off one persistent canvas + state machine ("HeroSM":
// pose 0-4, talkLevel 0-1, see docs/rive-fox-rig-spec.md) so a pose change
// is just an input update, not a teardown/rebuild — that's what keeps the
// idle breathing/blink loop running continuously across story beats instead
// of restarting every line. Falls back to the pre-Rive video/GSAP pose art
// (foxPoseHTML/animateFoxPose) whenever the CDN, WASM runtime, or
// public/rive/fox.riv itself isn't there yet — mountFoxRive's onFail below.
// The owl (still hand-coded SVG, no rig built for it) always takes the
// rebuild path, same as before this change.
let heroCharacter = null;

function setHero(character, pose) {
  if (character !== heroCharacter) {
    unmountFoxRive();
    heroCharacter = character;
    if (character === "fox") {
      heroStage.innerHTML = '<canvas class="fox-pose fox-rive"></canvas>';
      const canvas = heroStage.querySelector(".fox-rive");
      mountFoxRive(canvas, pose, () => {
        // .riv missing/blocked/mismatched contract — drop back to the
        // pre-Rive renderer for as long as this hero stays "fox".
        if (heroCharacter === "fox" && !isFoxRiveActive()) {
          heroStage.innerHTML = foxPoseHTML(pose);
          animateFoxPose(heroStage, pose);
        }
      });
    } else if (character === "owl") {
      heroStage.innerHTML = owlSVG(pose);
    } else {
      heroStage.innerHTML = "";
    }
    return;
  }
  if (character === "fox") {
    if (isFoxRiveActive()) {
      setFoxRivePose(pose);
    } else {
      // Rive never activated for this mount (still loading, or already
      // fell back) — pendingPose covers the "still loading" case once it
      // resolves; the fallback-art case needs its own re-render here since
      // there's no state machine listening for pose changes.
      setFoxRivePose(pose);
      heroStage.innerHTML = foxPoseHTML(pose);
      animateFoxPose(heroStage, pose);
    }
  } else if (character === "owl") {
    heroStage.innerHTML = owlSVG(pose);
  }
}

// TTS-driven mouth amplitude for the Rive fox's talkLevel input — mirrors
// the VAD mic analyser above, but reads the hero's own voice (heroVoice)
// instead of the mic, so the state machine's mouth-open blend tracks the
// actual audio rather than a fixed-rate flap loop.
let ttsAudioCtx = null;
let ttsAnalyser = null;
let ttsFloatBuf = null;
let ttsLevelRAF = null;

function ensureTTSAnalyser() {
  if (ttsAnalyser) return ttsAnalyser;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  ttsAudioCtx = new AudioCtx();
  // createMediaElementSource can only ever be called once per <audio>
  // element for the lifetime of the page — caching ttsAnalyser above makes
  // this function idempotent, which is what keeps that a non-issue.
  const source = ttsAudioCtx.createMediaElementSource(heroVoice);
  ttsAnalyser = ttsAudioCtx.createAnalyser();
  ttsAnalyser.fftSize = 512;
  ttsFloatBuf = new Float32Array(ttsAnalyser.fftSize);
  source.connect(ttsAnalyser);
  source.connect(ttsAudioCtx.destination); // keep audible — analyser alone is a silent tap
  return ttsAnalyser;
}

function startTalkLevelLoop() {
  if (!isFoxRiveActive()) return; // nothing to drive without the state machine input
  try {
    ensureTTSAnalyser();
  } catch (err) {
    log(`rive talkLevel: analyser unavailable (${err.message})`);
    return;
  }
  cancelAnimationFrame(ttsLevelRAF);
  function tick() {
    ttsAnalyser.getFloatTimeDomainData(ttsFloatBuf);
    let sum = 0;
    for (let i = 0; i < ttsFloatBuf.length; i++) sum += ttsFloatBuf[i] * ttsFloatBuf[i];
    const rms = Math.sqrt(sum / ttsFloatBuf.length);
    setFoxTalkLevel(Math.max(0, Math.min(1, rms * 6))); // rough gain so quiet Piper output still opens the mouth
    if (!heroVoice.paused && !heroVoice.ended) {
      ttsLevelRAF = requestAnimationFrame(tick);
    } else {
      setFoxTalkLevel(0);
    }
  }
  tick();
}
heroVoice.addEventListener("play", startTalkLevelLoop);

function setHeroPoseOverride(pose) {
  const hero = HERO_FOR_STATE[currentId] || { character: "fox" };
  setHero(hero.character, pose);
}

function updateHeroAmplitude(rms) {
  if (!heroStage) return;
  const listening = vadArmed || vadRecording;
  heroStage.classList.toggle("hero-listening", listening);
  if (!listening) return;
  const level = Math.max(0, Math.min(1, rms / 0.08));
  heroStage.style.setProperty("--amp", String(level));
}

function startVadRecorder() {
  // iOS/WebKit: a MediaStreamTrack read by a Web Audio AnalyserNode (vadStream,
  // used for RMS speech detection) AND recorded by a MediaRecorder at the same
  // time can silently produce zero-byte output on Safari. So recording gets
  // its own dedicated getUserMedia stream instead of reusing vadStream — same
  // pattern as the manual startRecording() path, which was verified working
  // on a real iPhone earlier.
  vadRecording = true; // set synchronously so vadLoop() doesn't re-enter while the stream request is in flight
  recordBtn.classList.add("recording", "pulse");
  statusText.textContent = "Слушаю...";
  setStage("mic", "running", "запись");
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (!vadArmed) {
        // question was answered/left while permission was pending
        stream.getTracks().forEach((t) => t.stop());
        vadRecording = false;
        return;
      }
      vadRecordStream = stream;
      const mimeType = pickMimeType();
      vadRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      currentMimeType = vadRecorder.mimeType || mimeType || "audio/webm";
      chunks = [];
      vadRecorder.ondataavailable = (e) => chunks.push(e.data);
      vadRecorder.onstop = onRecordingStop; // same submit path as the manual flow
      vadRecorder.start();
      recordingStartedAt = Date.now();
    })
    .catch((err) => {
      vadRecording = false;
      recordBtn.classList.remove("recording", "pulse");
      setStage("mic", "err", err.name || err.message);
      log(`VAD запись недоступна: ${err.name || err.message}`);
    });
}

function stopVadRecorder() {
  // stop tracks before .stop(), matching the manual stopRecording() order
  vadRecordStream?.getTracks().forEach((t) => t.stop());
  vadRecorder?.stop();
  vadRecordStream = null;
  vadRecording = false;
  recordBtn.classList.remove("recording", "pulse");
}

function finishVadTurn() {
  vadArmed = false;
  statusText.textContent = "";
  setHeroPoseOverride("think");
  setStage("mic", "ok", "получено");
  resetTurnStages();
  stopVadRecorder();
}

function armVadForQuestion() {
  vadArmed = true;
  vadRecording = false;
  resetTurnStages();
  setStage("mic", "running", "жду речь");
  ensureMicStream().catch((err) => {
    // No mic / permission denied to the persistent stream — VAD can never
    // arm, so leave it disarmed and let the manual recordBtn path (its own
    // independent getUserMedia call, see startRecording()) carry the demo.
    vadArmed = false;
    heroStage.classList.remove("hero-listening");
    setStage("mic", "err", err.name || err.message);
    log(`VAD недоступен, ручной режим: ${err.name || err.message}`);
  });
}

function disarmVad() {
  vadArmed = false;
  heroStage.classList.remove("hero-listening");
  setStage("mic", "idle", "");
  if (vadRecording) stopVadRecorder();
}

function vadLoop() {
  vadFrameId = requestAnimationFrame(vadLoop);
  if (!vadAnalyser) return;
  const rms = currentRMS();
  updateHeroAmplitude(rms);

  if (!vadArmed) return;
  const now = performance.now();

  if (!vadRecording) {
    if (rms > VAD_START_RMS) {
      vadSpeechStartedAt = now;
      vadLastLoudAt = now;
      startVadRecorder();
    }
    return;
  }

  if (rms > VAD_SILENCE_RMS) vadLastLoudAt = now;
  const sinceStart = now - vadSpeechStartedAt;
  const sinceLoud = now - vadLastLoudAt;

  if (sinceStart > VAD_MAX_RECORD_MS) {
    finishVadTurn();
  } else if (sinceStart > VAD_MIN_SPEECH_MS && sinceLoud > VAD_SILENCE_MS) {
    finishVadTurn();
  }
}
vadFrameId = requestAnimationFrame(vadLoop);

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
  cancelNarrationAutoAdvance();
  disarmVad();
  aiVerdictEl.classList.remove("show");
  blockedFlash.classList.remove("show", "materialize-in");
  resultEl.classList.remove("show", "materialize-in");
  statusText.textContent = "";
  thinkingDots.hidden = true;

  if (id === "parent_report") {
    storySpeaker.textContent = "";
    storyKk.textContent = "";
    storyRu.textContent = "";
    setHero(null, null);
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
  setHero(hero.character, hero.pose);
  const speakDone = speakLine(s.kk, id);

  if (s.kind === "narration") {
    nextBtn.style.display = "block";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    // Child screen has no buttons by design (IDEA.md "Детский экран без
    // интерфейса") — nextBtn stays only as an operator override/killswitch.
    // Normal flow advances itself once the line has finished playing
    // (live TTS, fallback audio, or even a silent text-only failure —
    // speakLine() never rejects, so this always eventually fires).
    speakDone.then(() => {
      if (currentId !== id || !s.next) return;
      narrationAutoAdvanceTimer = setTimeout(() => {
        narrationAutoAdvanceTimer = null;
        if (currentId === id) renderState(s.next);
      }, NARRATION_AUTO_ADVANCE_MS);
    });
  } else if (s.kind === "question") {
    nextBtn.style.display = "none";
    recordBtn.style.display = "block";
    recordBtn.disabled = false;
    recordBtn.textContent = "🎙 Слушаю… (нажми, если ребёнок уже ответил)";
    recordBtn.classList.remove("recording", "pulse");
    uploadRow.style.display = "block";
    if (activeQuestionId !== id) {
      reaskUsed = false;
      activeQuestionId = id;
    }
    // Wait for the hero's own voice line to finish before arming the mic —
    // otherwise VAD hears the phone's own speaker output (heroVoice) as
    // "the child speaking" and records/classifies that instead.
    speakDone.then(() => {
      if (currentId === id) armVadForQuestion();
    });
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
  cancelNarrationAutoAdvance();
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

  // Captured so a slow /api/transcribe response can't paint its result (or
  // trigger classify/auto-advance) onto whatever question the operator has
  // since moved on to — see the matching guard in classifyAndSuggest().
  const askedId = currentId;
  player.src = URL.createObjectURL(blob);

  recordBtn.disabled = true;
  fileInput.disabled = true;
  statusText.textContent = "Распознаю";
  thinkingDots.hidden = false;

  const form = new FormData();
  form.append("audio", blob, filename);
  setStage("stt", "running", "");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (currentId !== askedId) {
      log(`transcribe: ответ на "${askedId}" пришёл поздно, оператор уже на "${currentId}" — игнорирую`);
      return;
    }

    statusText.textContent = "";
    thinkingDots.hidden = true;
    transcriptEl.textContent = data.transcript || "(тишина / не распознано)";
    metaEl.textContent = `${data.ms} ms · ${data.engine === "groq" ? "Groq" : "локальный Whisper (fallback)"}`;
    setStage("stt", "ok", `${data.ms}ms ${data.engine === "groq" ? "groq" : "local"}`);

    if (data.blocked) {
      setStage("safety", "err", "BLOCKED");
      blockedFlash.classList.add("show", "materialize-in");
      storyEnded = true;
      recordBtn.style.display = "none";
      uploadRow.style.display = "none";
      log(`BLOCKED (автоматически, без оператора): "${data.transcript}" — сценарий остановлен`);
    } else {
      setStage("safety", "ok", "");
      resultEl.classList.add("show", "materialize-in");
      log(`transcript: "${data.transcript}" (${data.ms}ms)`);
      classifyAndSuggest(data.transcript);
    }
  } catch (err) {
    if (currentId !== askedId) {
      log(`transcribe: ошибка для "${askedId}" пришла поздно, оператор уже на "${currentId}" — игнорирую`);
      return;
    }
    // Total STT failure (Groq and local Whisper both down, or no network to
    // the server at all) — the operator still needs a way to move the story
    // forward. Show the manual Correct/Re-ask/Advance controls (normally
    // gated behind a successful transcribe) so they can judge the answer by
    // ear instead of getting stuck with no path out. See IDEA.md "Как
    // закрываем риски" / network-fail fallback.
    statusText.textContent = `Ошибка распознавания: ${err.message}`;
    thinkingDots.hidden = true;
    transcriptEl.textContent = "(распознавание недоступно — оцени ответ на слух)";
    metaEl.textContent = "";
    aiVerdictEl.classList.remove("show");
    resultEl.classList.add("show", "materialize-in");
    setStage("stt", "err", err.message);
    log(`STT недоступен, ручной режим: ${err.message}`);
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
  if (vadRecording) {
    // Operator override: end the current auto-captured turn right now
    // instead of waiting out the silence timer.
    finishVadTurn();
  } else if (vadArmed) {
    // VAD is armed but hasn't crossed the amplitude threshold yet — force
    // a manual start (e.g. the child is speaking too quietly to trip it).
    vadSpeechStartedAt = performance.now();
    vadLastLoudAt = performance.now();
    startVadRecorder();
  } else if (recording) {
    stopRecording();
  } else {
    // VAD never armed (mic/Web Audio unavailable) — fully independent
    // manual fallback path, see startRecording().
    startRecording();
  }
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

let narrationAutoAdvanceTimer = null;
const NARRATION_AUTO_ADVANCE_MS = 500;

function cancelNarrationAutoAdvance() {
  if (narrationAutoAdvanceTimer) {
    clearTimeout(narrationAutoAdvanceTimer);
    narrationAutoAdvanceTimer = null;
  }
}

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

// Local, network-free answer check — used only when /api/classify is
// unreachable, so the system still confirms itself instead of stalling on
// the operator's buttons. Reuses the same word-level fuzzy-match approach
// as spike/blocklist.js (Levenshtein tolerance scaled to word length),
// against the actual accepted-answer set for the current question (not a
// prose description — the real words currentId's criterion was built
// from, see rerollBerries()/rerollRhymeWord() above).
function localLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
function localTolerance(len) {
  if (len <= 3) return 1;
  if (len <= 6) return 1;
  return Math.max(2, Math.floor(len * 0.3));
}
function localWordsOf(transcript) {
  return transcript
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function localFuzzyIncludes(words, target) {
  const t = target.toLowerCase();
  return words.some((w) => localLevenshtein(w, t) <= localTolerance(t.length));
}

function localClassify(stateId, transcript) {
  const words = localWordsOf(transcript);
  if (words.length === 0) return { label: "unclear", reason: "пусто (локально)" };

  if (stateId === "fox_question") {
    const accepted = [NUM_KK[berryCount], NUM_RU[berryCount], String(berryCount)];
    const hit = accepted.some((form) => localFuzzyIncludes(words, form));
    return hit
      ? { label: "correct", reason: "число совпало (локально)" }
      : { label: "unclear", reason: "число не совпало (локально)" };
  }

  if (stateId === "owl_question") {
    // Criterion is genuinely open-ended (any real word rhyming with the
    // source word) — a fixed word list would wrongly reject valid answers.
    // Approximate with the shared suffix instead of an exact word match.
    const rhymes = words.some((w) => /(ық|ик)$/.test(w));
    return rhymes
      ? { label: "correct", reason: "рифма «-ық/-ик» (локально)" }
      : { label: "unclear", reason: "рифма не найдена (локально)" };
  }

  return { label: "unclear", reason: "неизвестный вопрос (локально)" };
}

function showVerdictAndAutoAdvance(data, source) {
  const labelText = { correct: "✅ ВЕРНО", incorrect: "❌ НЕВЕРНО", unclear: "🔁 НЕ ПОНЯЛ / ПЕРЕСПРОСИТЬ" }[data.label];
  aiVerdictEl.className = `ai-verdict show ${data.label}`;
  aiVerdictEl.innerHTML = `
    <span class="label">${source}: ${labelText}</span>
    <span class="reason">${data.reason || ""}${data.ms ? ` (${data.ms}ms)` : ""}</span>
    <span class="countdown">Авто-переход через ${(AI_AUTO_ADVANCE_MS / 1000).toFixed(1)}с — нажми кнопку, чтобы отменить</span>
  `;
  log(`${source}: ${data.label} — "${data.reason}"${data.ms ? ` (${data.ms}ms)` : ""}`);

  cancelAiAutoAdvance();
  aiAutoAdvanceTimer = setTimeout(() => {
    aiAutoAdvanceTimer = null;
    if (data.label === "correct") markCorrect(`${source} (авто)`);
    else markReask(`${source} (авто)`);
  }, AI_AUTO_ADVANCE_MS);
}

async function classifyAndSuggest(transcript) {
  // Captured up front — a slow /api/classify response must not paint a
  // verdict or start an auto-advance countdown for a question the operator
  // has since left (see the matching guard in submitAudio()).
  const askedId = currentId;
  const s = STORY[askedId];
  if (s.kind !== "question" || !s.criterion) return;
  aiVerdictEl.className = "ai-verdict show";
  aiVerdictEl.innerHTML = `<span class="label">🤖 ИИ думает…</span>`;
  setStage("classify", "running", "");

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
    if (currentId !== askedId) return; // operator already moved on while this was in flight
    // The system still confirms itself here — it just switches from the
    // network LLM to a local, deterministic answer check instead of
    // parking on the operator's buttons until someone clicks.
    setStage("classify", "skip", "локальный фолбэк, без сети");
    log(`ИИ-классификатор недоступен, локальный фолбэк: ${err.message}`);
    const local = localClassify(askedId, transcript);
    showVerdictAndAutoAdvance(local, "🧮 Локально");
    return;
  }

  if (currentId !== askedId) return; // same guard for the success path
  setStage("classify", "ok", `${data.label} ${data.ms}ms`);
  showVerdictAndAutoAdvance(data, "🤖 ИИ");
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
Object.keys(pipelineStageEls).forEach((id) => setStage(id, "idle", ""));

const startOverlay = document.getElementById("startOverlay");
document.getElementById("startBtn").addEventListener("click", () => {
  startOverlay.style.display = "none";
  // Ask for the mic up front, inside this same tap, so the permission
  // prompt (and its latency) is out of the way before the first question
  // ever arrives — not fatal if it fails, armVadForQuestion() re-attempts
  // ensureMicStream() per-question and falls back to the manual button.
  ensureMicStream().catch((err) => log(`mic prefetch failed: ${err.name || err.message}`));
  renderState(START_STATE);
});
