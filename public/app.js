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
const sceneOverlayNext = document.getElementById("sceneOverlayNext");
const operatorPanel = document.getElementById("operatorPanel");
const operatorToggle = document.getElementById("operatorToggle");
const pinGate = document.getElementById("pinGate");
const pinInput = document.getElementById("pinInput");
const pinSubmitBtn = document.getElementById("pinSubmitBtn");
const endScreen = document.getElementById("endScreen");
const playAgainBtn = document.getElementById("playAgainBtn");
const parentBtn = document.getElementById("parentBtn");

// One background image per "world" + a CSS overlay class per scene look
// (night / river / forest / cave / dawn) — see #sceneOverlay in index.html.
const SCENES = {
  night: { image: "/images/bg-fox.png", cls: "scene-night" },
  river: { image: "/images/bg-fox.png", cls: "scene-river" },
  forest: { image: "/images/bg-fox.png", cls: "scene-forest" },
  cave: { image: "/images/bg-owl.jpg", cls: "scene-cave" },
  dawn: { image: "/images/bg-fox.png", cls: "scene-dawn" },
};

// Two stacked overlay layers cross-fade (see .scene-layer in
// design-system.css): the new look is painted on whichever layer is
// currently hidden, then the two swap opacity. Purely visual and
// synchronous — never awaited by the story flow.
const sceneLayers = [sceneOverlay, sceneOverlayNext];
let sceneFront = 0; // index of the layer currently visible
let currentSceneCls = "";
let currentSceneImage = "";

// The cave stays "lit" from the moment the fox walks in (cave_enter) through
// the whole echo beat — going dark again mid-scene would read as a bug.
const CAVE_LIT_IDS = new Set(["cave_enter", "q_echo", "echo_reask", "echo_reveal"]);

function applyScene(bg, nodeId) {
  const sc = SCENES[bg] || SCENES.night;
  const lit = sc.cls === "scene-cave" && CAVE_LIT_IDS.has(nodeId);
  const cls = `scene-layer ${sc.cls}${lit ? " scene-cave-lit" : ""}`;

  if (sc.image !== currentSceneImage) {
    // Background images can't cross-fade on one element — dip the stage to
    // near-black for the swap instead of cutting hard.
    const first = currentSceneImage === "";
    currentSceneImage = sc.image;
    if (first) {
      sceneStage.style.backgroundImage = `url(${sc.image})`;
    } else {
      sceneStage.style.opacity = "0.15";
      setTimeout(() => {
        sceneStage.style.backgroundImage = `url(${sc.image})`;
        sceneStage.style.opacity = "1";
      }, 300);
    }
  }

  if (cls === currentSceneCls) return;
  const front = sceneLayers[sceneFront];
  if (front.classList.contains(sc.cls)) {
    // Same world, only the torch/lit modifier changed — animate it in place
    // (the ::after radius transition) instead of cross-fading to itself.
    front.className = cls;
    currentSceneCls = cls;
    return;
  }
  const back = sceneLayers[1 - sceneFront];
  back.className = cls;
  void back.offsetWidth; // commit the class before flipping opacity, or there's no transition
  back.style.opacity = "1";
  front.style.opacity = "0";
  sceneFront = 1 - sceneFront;
  currentSceneCls = cls;
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
  // Staggered pop-in (CSS .track / @keyframes trackPop): one track lands
  // every 160ms so the child can count along.
  trackOverlay.innerHTML = TRACK_SLOTS.slice(0, trackCount)
    .map((p, i) => `<span class="track" style="left:${p.left};top:${p.top};animation-delay:${i * 160}ms"></span>`).join("");
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
  if (id === "q_echo") return `q_echo_${brotherName.slug}`;
  return id;
}

// --- Child-facing feedback (fire-and-forget) --------------------------
// Everything below is decoration: it is called for its side effect and
// never awaited, so a failure (no WebAudio, no GSAP, blocked autoplay)
// can't stall advanceFromQuestion / renderState / the VAD pipeline.
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function burstSparkles() {
  if (!heroStage || prefersReducedMotion() || typeof sparkleVectors !== "function") return;
  const count = 10 + Math.floor(Math.random() * 5); // 10..14
  const nodes = sparkleVectors(count).map(({ dx, dy }, i) => {
    const el = document.createElement("span");
    el.className = "sparkle";
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.style.animationDelay = `${i * 14}ms`;
    heroStage.appendChild(el);
    return el;
  });
  setTimeout(() => nodes.forEach((el) => el.remove()), 1000);
}

// Two short sine notes, synthesized — no audio file to ship, load or fail.
// Reuses the VAD's AudioContext when the mic is already up (browsers cap how
// many a page may create).
function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!vadAudioCtx) vadAudioCtx = new AudioCtx();
    const ctx = vadAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.01;
    [880, 1320].forEach((freq, i) => {
      const at = t0 + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.14);
    });
  } catch (err) {
    log(`ding skipped: ${err.message}`);
  }
}

// Gentle "I didn't catch that" head-shake — never on the reveal (the reveal
// line is its own feedback) and never with a sound.
function heroShake() {
  if (!heroStage || prefersReducedMotion()) return;
  const img = heroStage.querySelector(".fox-pose");
  if (img && typeof gsap !== "undefined") {
    gsap.to(img, {
      rotation: 4, duration: 0.125, repeat: 3, yoyo: true, ease: "sine.inOut",
      onComplete: () => gsap.set(img, { rotation: 0 }),
    });
    return;
  }
  const target = img || heroStage.firstElementChild;
  if (!target) return;
  target.classList.remove("hero-shake");
  void target.offsetWidth; // restart the keyframe if it's still on the element
  target.classList.add("hero-shake");
  setTimeout(() => target.classList.remove("hero-shake"), 560);
}

// --- Echo beat ---------------------------------------------------------
// In the cave, the fox's line comes back at him once: same audio, quieter,
// slower, 450ms after the original finishes. Works for both the live TTS
// blob URL and the pre-rendered .wav — it just replays whatever heroVoice
// ended up with.
const ECHO_IDS = new Set(["q_echo", "echo_reask", "echo_reveal"]);
const heroEcho = document.getElementById("heroEcho");
let pendingEchoHandler = null;

function scheduleEcho(src) {
  if (!heroEcho || !src) return;
  if (pendingEchoHandler) heroVoice.removeEventListener("ended", pendingEchoHandler);
  const onEnded = () => {
    heroVoice.removeEventListener("ended", onEnded);
    if (pendingEchoHandler === onEnded) pendingEchoHandler = null;
    setTimeout(() => {
      try {
        heroEcho.src = src;
        heroEcho.volume = 0.35;
        heroEcho.playbackRate = 0.95;
        const p = heroEcho.play();
        if (p && p.catch) p.catch(() => {}); // autoplay refused — silent, the line was already heard
      } catch (err) {
        /* echo is decoration; never surface it */
      }
    }, 450);
  };
  pendingEchoHandler = onEnded;
  heroVoice.addEventListener("ended", onEnded);
}

async function playWithTimeout(ms) {
  const playTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`play() timed out after ${ms}ms`)), ms),
  );
  await Promise.race([heroVoice.play(), playTimeout]);
}

// Next Steps #7: pre-rendered fallback audio (tools/prerender.py output,
// served from /audio/<stateId>.wav) — stage-risk hedge in case live Piper
// or the request itself lags. Live call gets a short leash (2.5s); on any
// failure or timeout we fall back to the static file for that state.
async function speakLine(text, stateId, { echo = false } = {}) {
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
    if (echo) scheduleEcho(heroVoice.src);
    // play() can hang indefinitely instead of rejecting in some browser/
    // automation contexts — never let audio playback stall the demo.
    await playWithTimeout(3000);
    log(`voice: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}" (${ms}ms synth)`);
    setStage("tts", "ok", `${ms}ms live`);
  } catch (err) {
    if (stateId) {
      try {
        heroVoice.src = `/audio/${stateId}.wav`;
        if (echo) scheduleEcho(heroVoice.src);
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

// Tuned for 3-7-year-olds (quieter than adults, pause mid-phrase): lower
// start/keep thresholds, longer end-of-turn silence. Re-check against real
// child recordings — these are informed guesses, not measurements.
const VAD_START_RMS = 0.014;
const VAD_SILENCE_RMS = 0.009;
const VAD_SILENCE_MS = 1400;
const VAD_MIN_SPEECH_MS = 300;
const VAD_MAX_RECORD_MS = 8000;
// The recorder runs the whole time a question is armed, in small slices,
// so the clip can start ~500 ms BEFORE the amplitude gate tripped — the
// first consonant of a child's answer is exactly what the gate misses.
const VAD_CHUNK_MS = 250;
const VAD_PREROLL_CHUNKS = 2;
let vadChunks = [];
let vadSpeechChunkIdx = 0;
let vadSpoke = false; // speech was detected during this arming (independent of chunk timing)
let vadTurnNodeId = null; // node/brother captured at speech start: renderState may move on before the async onstop
let vadTurnBrother = "";
let vadRecorderGen = 0; // bumped per recorder so a stale onstop can't clobber the next question's buffer

async function ensureMicStream() {
  if (vadStream) return vadStream;
  vadStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!vadAudioCtx) vadAudioCtx = new AudioCtx(); // may already exist from playDing()
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

const listenCue = document.getElementById("listenCue");

// The child is never told to press anything, so the screen has to say
// "I'm listening" by itself — a calm caption, not a blinking alert.
function setListenCue(listening, recording) {
  if (!listenCue) return;
  listenCue.classList.toggle("show", listening);
  if (listening) listenCue.textContent = recording ? "Естіп тұрмын" : "Тыңдаймын…";
}

function updateHeroAmplitude(rms) {
  if (!heroStage) return;
  const listening = vadArmed || vadRecording;
  heroStage.classList.toggle("hero-listening", listening);
  heroStage.classList.toggle("hero-recording", vadRecording);
  setListenCue(listening, vadRecording);
  if (!listening) return;
  const level = Math.max(0, Math.min(1, rms / 0.08));
  heroStage.style.setProperty("--amp", String(level));
}

function startVadRecorder() {
  const mimeType = pickMimeType();
  vadRecorder = mimeType ? new MediaRecorder(vadStream, { mimeType }) : new MediaRecorder(vadStream);
  currentMimeType = vadRecorder.mimeType || mimeType || "audio/webm";
  vadChunks = [];
  vadSpeechChunkIdx = 0;
  vadSpoke = false;
  vadRecorder.ondataavailable = (e) => {
    const chunk = e.data && e.data.size ? e.data : null;
    vadChunks = nextBuffer(vadChunks, chunk, vadSpoke, VAD_PREROLL_CHUNKS);
  };
  const gen = ++vadRecorderGen;
  vadRecorder.onstop = () => onVadRecordingStop(gen);
  vadRecorder.start(VAD_CHUNK_MS);
}

function markVadSpeechStart() {
  vadSpeechChunkIdx = vadChunks.length;
  vadSpoke = true;
  vadTurnNodeId = currentId;
  vadTurnBrother = brotherName?.kkLower || "";
  recordingStartedAt = Date.now();
  vadRecording = true;
  recordBtn.classList.add("recording");
  statusText.textContent = "Слушаю...";
  setStage("mic", "running", "запись");
}

function stopVadRecorder() {
  if (vadRecorder && vadRecorder.state !== "inactive") vadRecorder.stop(); // keeps vadStream's tracks alive for the next question
  vadRecording = false;
  recordBtn.classList.remove("recording");
}

async function onVadRecordingStop(gen) {
  if (gen !== vadRecorderGen) return; // superseded recorder (disarm + re-arm raced its async onstop)
  const parts = assembleClip(vadChunks, vadSpeechChunkIdx, VAD_PREROLL_CHUNKS);
  vadChunks = [];
  if (!vadSpoke || !parts.length) return; // disarmed without speech (question changed) — nothing to send
  chunks = parts;
  // VAD_MIN_SPEECH_MS is the gate that already accepted this turn — holding it
  // to the manual flow's longer MIN_RECORDING_MS would silently drop a valid
  // short answer ("да", "екі").
  await onRecordingStop({ nodeId: vadTurnNodeId, brotherName: vadTurnBrother }, { minMs: VAD_MIN_SPEECH_MS });
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
  ensureMicStream()
    .then(() => {
      // Record from the moment the question is armed so the pre-roll buffer
      // already holds the instant before the amplitude gate trips.
      if (vadArmed && !vadRecorder) startVadRecorder();
    })
    .catch((err) => {
    // No mic / permission denied to the persistent stream — VAD can never
    // arm, so leave it disarmed and let the manual recordBtn path (its own
    // independent getUserMedia call, see startRecording()) carry the demo.
    vadArmed = false;
    heroStage.classList.remove("hero-listening", "hero-recording");
    setListenCue(false, false);
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
  heroStage.classList.remove("hero-listening", "hero-recording");
  setListenCue(false, false);
  setStage("mic", "idle", "");
  vadRecording = false;
  recordBtn.classList.remove("recording");
  if (vadRecorder && vadRecorder.state !== "inactive") vadRecorder.stop(); // onVadRecordingStop discards if !vadSpoke
  vadRecorder = null;
}

function vadLoop() {
  vadFrameId = requestAnimationFrame(vadLoop);
  if (!vadAnalyser) return;
  const rms = currentRMS();
  updateHeroAmplitude(rms);

  if (!vadArmed) return;
  const now = performance.now();

  if (!vadRecording) {
    if (rms > VAD_START_RMS && vadRecorder && vadRecorder.state === "recording") {
      vadSpeechStartedAt = now;
      vadLastLoudAt = now;
      markVadSpeechStart();
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
    pinGate.classList.remove("show", "materialize-in");
    pinInput.value = "";
    lastSummary = Session.finish({ completed: true });
    endScreen.classList.add("show");
    log(`→ ${id}: балаға арналған соңғы экран (PIN жасырын)`);
    return;
  }
  endScreen.classList.remove("show");
  pinGate.classList.remove("show", "materialize-in");
  reportPanel.classList.remove("show", "materialize-in");
  sceneStageWrap.classList.remove("hidden");
  storyLineEl.style.display = "";

  applyScene(s.bg, id);
  heroStage.classList.toggle("pose-happy", s.pose === "happy");
  renderTrackOverlay(id === "q_tracks" || id === "tracks_reask" || id === "tracks_reveal");

  storySpeaker.textContent = s.speaker;
  storyKk.textContent = s.kk;
  storyRu.textContent = s.ru;
  heroStage.innerHTML = renderHero(s);
  if (s.character === "fox") animateFoxPose(heroStage, s.pose);
  const speakDone = speakLine(s.kk, audioIdFor(id), { echo: ECHO_IDS.has(id) });

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
      currentRoute = preferredRoute || (Math.random() < 0.5 ? "river" : "forest");
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
  if (!currentId) return;
  cancelNarrationAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "narration") return;
  let next = s.next;
  if (currentId === "found" && Session.memory().runs > 0) next = "thanks_again";
  if (currentId === "fork_reveal") next = STORY.q_fork.onAnswer[currentRoute || preferredRoute || (Math.random() < 0.5 ? "river" : "forest")];
  if (next) renderState(next);
});

// PIN gate is a cosmetic step (Next Steps #6 report is mocked data, no real
// auth backend) — any PIN unlocks it, it just adds the "this is the parent's
// private area" beat before showing numbers.
let lastSummary = null;
function unlockReport() {
  endScreen.classList.remove("show");
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

// Shared by the operator's "Сначала" killswitch and the child's "Тағы
// ойнаймыз" on the end screen — both fully reset state and jump back to
// the intro (startStateForMemory picks intro vs intro_again by replay count).
function restartStory() {
  storyEnded = false;
  activeQuestionId = null;
  currentRoute = null;
  endScreen.classList.remove("show");
  Session.start();
  renderState(startStateForMemory());
}

resetBtn.addEventListener("click", () => {
  restartStory();
  log("── сброс сценария ──");
});

playAgainBtn.addEventListener("click", () => {
  restartStory();
  log("── тағы ойнаймыз: сценарий басынан ──");
});

parentBtn.addEventListener("click", () => {
  endScreen.classList.remove("show");
  pinInput.value = "";
  pinGate.classList.add("show", "materialize-in");
  log("→ parent_report: баладан ата-ана PIN-гейтіне өтті");
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
  mediaRecorder.onstop = () => onRecordingStop(); // drop the DOM event: onRecordingStop takes (meta, opts)
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

async function onRecordingStop(meta = {}, { minMs = MIN_RECORDING_MS } = {}) {
  const elapsed = Date.now() - recordingStartedAt;
  if (elapsed < minMs) {
    statusText.textContent = minMs === MIN_RECORDING_MS
      ? "Слишком коротко — нажми «Записать» и скажи ответ, потом «Стоп»"
      : "Слишком коротко — скажи ещё раз"; // VAD turn: there is no button to press
    log(`recording skipped: only ${elapsed}ms (min ${minMs}ms)`);
    return;
  }
  const mime = currentMimeType || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  await submitAudio(blob, `clip.${extFromMime(mime)}`, meta);
}

async function submitAudio(blob, filename, meta = {}) {
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
  // meta wins when present: a VAD clip belongs to the question that was on
  // screen when the child started talking, not to whatever renderState has
  // advanced to by the time the async onstop fires.
  form.append("nodeId", meta.nodeId ?? (currentId || ""));
  form.append("brotherName", meta.brotherName ?? (brotherName?.kkLower || ""));
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
  } else if (vadArmed && vadRecorder && vadRecorder.state === "recording") {
    // VAD is armed but hasn't crossed the amplitude threshold yet — force
    // a manual start (e.g. the child is speaking too quietly to trip it).
    vadSpeechStartedAt = performance.now();
    vadLastLoudAt = performance.now();
    markVadSpeechStart();
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
  // Child-facing "yes!" — sparkles + a two-note ding. Fired before the
  // advance and never awaited, so the story moves at exactly the same speed
  // whether or not any of it works.
  burstSparkles();
  playDing();
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
    heroShake(); // after the re-render: renderState replaces #heroStage's contents
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
    <span class="reason">${esc(data.reason || "")}${data.ms ? ` (${data.ms}ms)` : ""}</span>
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
  if (!currentId) return;
  markCorrect("оператор");
});
document.getElementById("btnReask").addEventListener("click", () => {
  if (storyEnded) return;
  if (!currentId) return;
  markReask("оператор");
});

document.getElementById("btnAdvance").addEventListener("click", () => {
  if (storyEnded) return;
  if (!currentId) return;
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

// ?route=river|forest lets library.html cards pin which fork the fox takes
// at q_fork when the child's answer doesn't make it clear — anything else
// (missing, "op", typos) falls back to the existing 50/50 coin flip.
const routeParam = new URLSearchParams(location.search).get("route");
const preferredRoute = routeParam === "river" || routeParam === "forest" ? routeParam : null;
if (preferredRoute) log(`маршрут по умолчанию из URL: ${preferredRoute}`);

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
