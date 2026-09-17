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
const sceneStageWrap = document.getElementById("sceneStageWrap");
const storyLineEl = document.getElementById("storyLine");
const trackOverlay = document.getElementById("trackOverlay");
const sceneOverlay = document.getElementById("sceneOverlay");
const operatorPanel = document.getElementById("operatorPanel");
const operatorToggle = document.getElementById("operatorToggle");
const pinGate = document.getElementById("pinGate");
const pinInput = document.getElementById("pinInput");
const pinSubmitBtn = document.getElementById("pinSubmitBtn");

// One background image per "world" + a CSS overlay class per scene look
// (night / river / forest / cave / dawn) — see #sceneOverlay in index.html.
const SCENES = {
  night: { image: "/images/bg-fox.png", cls: "scene-night" },
  river: { image: "/images/bg-fox.png", cls: "scene-river" },
  forest: { image: "/images/bg-fox.png", cls: "scene-forest" },
  cave: { image: "/images/bg-owl.jpg", cls: "scene-cave" },
  dawn: { image: "/images/bg-fox.png", cls: "scene-dawn" },
};

function applyScene(bg) {
  const sc = SCENES[bg] || SCENES.night;
  sceneStage.style.backgroundImage = `url(${sc.image})`;
  sceneOverlay.className = sc.cls;
}

// Replay variety: the number of tracks and the brother's name are rolled
// once per session (never mid-question — a re-ask must show the same
// tracks). Text templates + LLM criteria live in story.js.
const TRACK_SLOTS = [
  { left: "22%", top: "72%" }, { left: "34%", top: "66%" }, { left: "46%", top: "72%" },
  { left: "58%", top: "66%" }, { left: "70%", top: "72%" },
];
let trackCount = 3;
function rerollTracks() {
  trackCount = 2 + Math.floor(Math.random() * 4); // 2..5
  const t = trackLines(trackCount);
  STORY.tracks_reveal.kk = t.revealKk;
  STORY.tracks_reveal.ru = t.revealRu;
  STORY.q_tracks.criterion = t.criterion;
}
function renderTrackOverlay(show) {
  if (!show) { trackOverlay.innerHTML = ""; trackOverlay.classList.remove("show"); return; }
  trackOverlay.innerHTML = TRACK_SLOTS.slice(0, trackCount)
    .map((p) => `<span class="track" style="left:${p.left};top:${p.top}"></span>`).join("");
  trackOverlay.classList.add("show");
}

let brotherName = BROTHER_NAMES[0];
function rerollBrotherName() {
  brotherName = BROTHER_NAMES[Math.floor(Math.random() * BROTHER_NAMES.length)];
  const e = echoLines(brotherName);
  STORY.q_echo.kk = e.kk;
  STORY.q_echo.ru = e.ru;
  STORY.q_echo.criterion = e.criterion;
}

// Pre-rendered fallback audio id: dynamic lines have one .wav per variant
// (tools/prerender.py renders tracks_reveal_2..5 and q_echo_<name>).
function audioIdFor(id) {
  if (id === "tracks_reveal") return `tracks_reveal_${trackCount}`;
  if (id === "q_echo") return `q_echo_${brotherName.kkLower}`;
  return id;
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
let vadRecording = false;
let vadArmed = false; // true only while the current question hasn't been answered yet
let vadSpeechStartedAt = 0;
let vadLastLoudAt = 0;

const VAD_START_RMS = 0.02; // amplitude that counts as "speech began"
const VAD_SILENCE_RMS = 0.012; // lower bar to still count as "mid-speech" (hysteresis, avoids chatter at the threshold)
const VAD_SILENCE_MS = 1000; // pause this long after speech means "child is done" (doc's 0.8-1.2s window)
const VAD_MIN_SPEECH_MS = 400; // ignore blips shorter than this (cough, mic bump)
const VAD_MAX_RECORD_MS = 8000; // hard cap so a held-open mic can't stall the demo indefinitely

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

function setHeroPoseOverride(pose) {
  const node = STORY[currentId] || { character: "fox" };
  heroStage.innerHTML = renderHero({ ...node, pose });
  if (node.character === "fox") animateFoxPose(heroStage, pose);
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
  const mimeType = pickMimeType();
  vadRecorder = mimeType ? new MediaRecorder(vadStream, { mimeType }) : new MediaRecorder(vadStream);
  currentMimeType = vadRecorder.mimeType || mimeType || "audio/webm";
  chunks = [];
  vadRecorder.ondataavailable = (e) => chunks.push(e.data);
  vadRecorder.onstop = onRecordingStop; // same submit path as the manual flow
  vadRecorder.start();
  recordingStartedAt = Date.now();
  vadRecording = true;
  recordBtn.classList.add("recording");
  statusText.textContent = "Слушаю...";
  setStage("mic", "running", "запись");
}

function stopVadRecorder() {
  vadRecorder?.stop(); // keeps vadStream's tracks alive for the next question
  vadRecording = false;
  recordBtn.classList.remove("recording");
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
    // No mic at all means no clip will ever be submitted, so the
    // Correct/Re-ask/Advance controls (normally opened by submitAudio)
    // would never appear and the operator would be stuck on this question
    // with no path out. Open them now — same manual-by-ear mode as the
    // total-STT-failure branch in submitAudio().
    transcriptEl.textContent = "(микрофон недоступен — оцени ответ на слух)";
    metaEl.textContent = "";
    lastTranscript = "";
    aiVerdictEl.classList.remove("show");
    resultEl.classList.add("show", "materialize-in");
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

let currentRoute = null; // "river" | "forest", set at q_fork

function renderState(id) {
  // Soft session cap: past the limit, any non-final beat jumps straight to
  // the finale instead of cutting the child off mid-story.
  if (!FINAL_IDS.has(id) && Session.overLimit()) {
    log(`лимит сессии (8 мин) → found`);
    id = "found";
  }
  currentId = id;
  if (id === "q_tracks" && activeQuestionId !== id) rerollTracks();
  if (id === "q_echo" && activeQuestionId !== id) rerollBrotherName();
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
    heroStage.innerHTML = "";
    sceneStageWrap.classList.add("hidden");
    // The speech bubble is empty on the report screen — leaving it mounted
    // renders a stray blank bubble above the parent's numbers.
    storyLineEl.style.display = "none";
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    reportPanel.classList.remove("show", "materialize-in");
    pinInput.value = "";
    pinGate.classList.add("show", "materialize-in");
    lastSummary = Session.finish({ completed: true });
    log(`→ ${id}: PIN-гейт перед отчётом родителю`);
    return;
  }
  pinGate.classList.remove("show", "materialize-in");
  reportPanel.classList.remove("show", "materialize-in");
  sceneStageWrap.classList.remove("hidden");
  storyLineEl.style.display = "";

  applyScene(s.bg);
  heroStage.classList.toggle("pose-happy", s.pose === "happy");
  renderTrackOverlay(id === "q_tracks" || id === "tracks_reask" || id === "tracks_reveal");

  storySpeaker.textContent = s.speaker;
  storyKk.textContent = s.kk;
  storyRu.textContent = s.ru;
  heroStage.innerHTML = renderHero(s);
  if (s.character === "fox") animateFoxPose(heroStage, s.pose);
  const speakDone = speakLine(s.kk, audioIdFor(id));

  if (id === "found") Session.moment("інісін тапты");
  if (id === "cave_enter") Session.moment("түлкіге батылдық берді");

  if (s.kind === "narration") {
    nextBtn.style.display = "block";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    // Child screen has no buttons by design (IDEA.md "Детский экран без
    // интерфейса") — nextBtn stays only as an operator override/killswitch.
    let next = s.next;
    if (id === "found" && Session.memory().runs > 0) next = "thanks_again";
    if (id === "fork_reveal") {
      currentRoute = Math.random() < 0.5 ? "river" : "forest";
      Session.setRoute(currentRoute);
      Session.moment(`түлкі жолды өзі таңдады: ${currentRoute === "river" ? "өзен" : "орман"}`);
      next = STORY.q_fork.onAnswer[currentRoute];
    }
    speakDone.then(() => {
      if (currentId !== id || !next) return;
      narrationAutoAdvanceTimer = setTimeout(() => {
        narrationAutoAdvanceTimer = null;
        if (currentId === id) renderState(next);
      }, NARRATION_AUTO_ADVANCE_MS);
    });
  } else if (s.kind === "question") {
    // A fresh question must never inherit the previous turn's answer state:
    // the operator buttons call recordAnswer() directly, without the
    // classify path that normally re-sets these.
    pendingRoute = null;
    lastTranscript = "";
    recordingStartedAt = 0;
    nextBtn.style.display = "none";
    recordBtn.style.display = "flex";
    recordBtn.disabled = false;
    recordBtn.textContent = "🎙";
    recordBtn.title = "Слушаю… (нажми, если ребёнок уже ответил)";
    recordBtn.setAttribute("aria-label", recordBtn.title);
    recordBtn.classList.remove("recording");
    uploadRow.style.display = "block";
    if (activeQuestionId !== id) {
      reaskUsed = false;
      activeQuestionId = id;
    }
    Session.questionShown(id, s.skill, reaskUsed ? 2 : 1);
    armVadForQuestion();
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
  if (storyEnded) return;
  cancelNarrationAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "narration") return;
  let next = s.next;
  if (currentId === "found" && Session.memory().runs > 0) next = "thanks_again";
  if (currentId === "fork_reveal") next = STORY.q_fork.onAnswer[currentRoute || "river"];
  if (next) renderState(next);
});

// PIN gate is a cosmetic step (Next Steps #6 report is mocked data, no real
// auth backend) — any PIN unlocks it, it just adds the "this is the parent's
// private area" beat before showing numbers.
let lastSummary = null;
function unlockReport() {
  pinGate.classList.remove("show", "materialize-in");
  reportDate.textContent = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  renderReport(lastSummary || Session.summarize(Session.current()), Session.history().slice(1));
  reportPanel.classList.add("show", "materialize-in");
  log("→ parent_report: PIN принят, отчёт из реальной сессии");
}
pinSubmitBtn.addEventListener("click", unlockReport);
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockReport();
});

resetBtn.addEventListener("click", () => {
  storyEnded = false;
  activeQuestionId = null;
  currentRoute = null;
  Session.start();
  renderState(startStateForMemory());
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
  recordBtn.textContent = "⏹";
  recordBtn.title = "Стоп";
  recordBtn.setAttribute("aria-label", recordBtn.title);
  recordBtn.classList.add("recording");
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
  recordBtn.textContent = "🎙";
  recordBtn.title = "Записать ответ";
  recordBtn.setAttribute("aria-label", recordBtn.title);
  recordBtn.classList.remove("recording");
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
  setStage("stt", "running", "");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    statusText.textContent = "";
    thinkingDots.hidden = true;
    transcriptEl.textContent = data.transcript || "(тишина / не распознано)";
    metaEl.textContent = `${data.ms} ms · ${data.engine === "groq" ? "Groq" : "локальный Whisper (fallback)"}`;
    setStage("stt", "ok", `${data.ms}ms ${data.engine === "groq" ? "groq" : "local"}`);

    if (data.blocked) {
      setStage("safety", "err", "BLOCKED");
      blockedFlash.classList.add("show", "materialize-in");
      storyEnded = true;
      Session.markBlocked();
      Session.finish({ completed: false });
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
    lastTranscript = "";
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

let pendingRoute = null; // route parsed from the last verdict (branch questions)
let lastTranscript = "";

function recordAnswer(verdict, source) {
  Session.answer({
    nodeId: currentId,
    transcript: lastTranscript,
    verdict,
    source,
    route: pendingRoute,
    answeredAt: recordingStartedAt || Date.now(),
  });
}

function markCorrect(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log(`${source}: ВЕРНО`);
  recordAnswer("correct", source);
  if (s.mode === "branch") {
    const route = pendingRoute || currentRoute || "river";
    currentRoute = route;
    Session.setRoute(route);
    Session.moment(`жолды таңдады: ${route === "river" ? "өзен" : "орман"}`);
    advanceFromQuestion(s.onAnswer[route]);
    return;
  }
  advanceFromQuestion(s.onCorrect);
}

function markReask(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  if (!reaskUsed) {
    reaskUsed = true;
    log(`${source}: ПЕРЕСПРОСИТЬ (1-я попытка)`);
    recordAnswer("unclear", source);
    advanceFromQuestion(s.onReask);
  } else {
    log(`${source}: ПЕРЕСПРОСИТЬ второй раз → авто-раскрытие (third strike)`);
    recordAnswer("reveal", source);
    advanceFromQuestion(s.onReveal);
  }
}

// For branch questions the LLM is asked to put the route name in `reason`;
// the local fallback returns it as `route` directly.
function routeFromVerdict(data) {
  if (data.route === "river" || data.route === "forest") return data.route;
  const r = String(data.reason || "").toLowerCase();
  if (r.includes("river")) return "river";
  if (r.includes("forest")) return "forest";
  return null;
}

function showVerdictAndAutoAdvance(data, source) {
  const s = STORY[currentId];
  pendingRoute = s.mode === "branch" ? routeFromVerdict(data) : null;
  if (s.mode === "branch" && data.label === "correct" && !pendingRoute) {
    data = { ...data, label: "unclear", reason: `${data.reason || ""} (маршрут не распознан)` };
  }
  const labelText = { correct: "✅ ВЕРНО", incorrect: "❌ НЕВЕРНО", unclear: "🔁 НЕ ПОНЯЛ / ПЕРЕСПРОСИТЬ" }[data.label];
  aiVerdictEl.className = `ai-verdict show ${data.label}`;
  aiVerdictEl.innerHTML = `
    <span class="label">${source}: ${labelText}${pendingRoute ? ` → ${pendingRoute}` : ""}</span>
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

function classifyCtx() {
  return { trackCount, brotherName: brotherName.kkLower, numKk: NUM_KK, numRu: NUM_RU };
}

async function classifyAndSuggest(transcript) {
  const s = STORY[currentId];
  if (s.kind !== "question" || !s.criterion) return;
  lastTranscript = transcript;
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
    // The system still confirms itself here — it just switches from the
    // network LLM to a local, deterministic answer check instead of
    // parking on the operator's buttons until someone clicks.
    setStage("classify", "skip", "локальный фолбэк, без сети");
    log(`ИИ-классификатор недоступен, локальный фолбэк: ${err.message}`);
    showVerdictAndAutoAdvance(localClassify(s, transcript, classifyCtx()), "🧮 Локально");
    return;
  }

  setStage("classify", "ok", `${data.label} ${data.ms}ms`);
  showVerdictAndAutoAdvance(data, "🤖 ИИ");
}

// A blocked session is terminal (Session.finish already ran) — the operator
// panel must not be able to walk it forward into parent_report and finish it
// a second time. resetBtn clears storyEnded and is the way out.
document.getElementById("btnCorrect").addEventListener("click", () => {
  if (storyEnded) return;
  markCorrect("оператор");
});
document.getElementById("btnReask").addEventListener("click", () => {
  if (storyEnded) return;
  markReask("оператор");
});

document.getElementById("btnAdvance").addEventListener("click", () => {
  if (storyEnded) return;
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log("оператор: ADVANCE (форс, STT-килл-свитч) → как «верно»");
  if (s.mode === "branch") { pendingRoute = pendingRoute || "river"; markCorrect("оператор-advance"); return; }
  recordAnswer("correct", "оператор-advance");
  advanceFromQuestion(s.onCorrect);
});

// boot — the very first speakLine() call must happen inside a real user
// gesture (a tap), or iOS Safari silently blocks audio playback (no
// permission dialog, just a rejected play() promise). Every other
// renderState() call in the app already runs inside a click handler;
// this "Бастау" gate makes the first one no exception.
function startStateForMemory() {
  return Session.memory().runs > 0 ? START_STATE_AGAIN : START_STATE;
}

// Operator panel: hidden from the child, toggled by the ` key, the ⚙ button
// or ?op=1 for a stage laptop.
function setOperatorPanel(show) {
  operatorPanel.classList.toggle("show", show);
}
operatorToggle.addEventListener("click", () => setOperatorPanel(!operatorPanel.classList.contains("show")));
document.addEventListener("keydown", (e) => {
  if (e.code === "Backquote" && !e.target.matches("input, textarea")) {
    e.preventDefault();
    setOperatorPanel(!operatorPanel.classList.contains("show"));
  }
});
if (new URLSearchParams(location.search).get("op") === "1") setOperatorPanel(true);

Object.keys(pipelineStageEls).forEach((id) => setStage(id, "idle", ""));

const startOverlay = document.getElementById("startOverlay");
document.getElementById("startBtn").addEventListener("click", () => {
  startOverlay.style.display = "none";
  // Ask for the mic up front, inside this same tap, so the permission
  // prompt (and its latency) is out of the way before the first question
  // ever arrives — not fatal if it fails, armVadForQuestion() re-attempts
  // ensureMicStream() per-question and falls back to the manual button.
  ensureMicStream().catch((err) => log(`mic prefetch failed: ${err.name || err.message}`));
  Session.start();
  renderState(startStateForMemory());
});
