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

// --- Which activity this page runs ------------------------------------
// The fox tale by default; ?lesson=<id> (cards on the root library page) picks a letter
// lesson. Both graphs live in one id space (lesson ids are prefixed a_ /
// q_a_), so every NODES[...] lookup below is the same for either.
const pageParams = new URLSearchParams(location.search);
const ACTIVITY = ACTIVITIES[pageParams.get("lesson")] || ACTIVITIES.story;
const NODES = Object.assign({}, STORY, ...Object.values(LETTER_LESSONS).map((l) => l.nodes), ...Object.values(TALES).map((t) => t.nodes));

// --- Gentle mode ----------------------------------------------------------
// For children with a speech delay / dysarthria / ASD: longer pauses before
// the mic gives up, one more re-ask before the hero answers himself, and no
// sparkles/shakes/drift (body.gentle in design-system.css). Switched on by
// the operator (persisted on this device), by ?mode=gentle, or by any
// lesson — ACTIVITIES[...].gentle. The field-tuned VAD_* constants below stay
// the defaults; this is a second profile layered on top, read per call.
const GENTLE_KEY = "ertegim.gentle";
const GENTLE_VAD = { silenceMs: 3500, silenceTimeoutMs: 15000, maxRecordMs: 15000, maxReasks: 2 };
let gentleOperator = false;
try { gentleOperator = localStorage.getItem(GENTLE_KEY) === "1"; } catch { /* private mode — stays off */ }
const gentleParam = pageParams.get("mode") === "gentle";
// The active child (profiles.js, set in the therapist's cabinet). Its
// settings win over the activity/operator defaults wherever they are set;
// null means "no override".
const CHILD = typeof Profiles !== "undefined" ? Profiles.active() : null;
const CHILD_SETTINGS = CHILD ? CHILD.settings : {};
function gentleMode() {
  if (CHILD_SETTINGS.gentle === true || CHILD_SETTINGS.gentle === false) return CHILD_SETTINGS.gentle || ACTIVITY.gentle;
  return ACTIVITY.gentle || gentleParam || gentleOperator;
}
function vadSilenceMs() { return CHILD_SETTINGS.silenceMs || (gentleMode() ? GENTLE_VAD.silenceMs : VAD_SILENCE_MS); }
function vadSilenceTimeoutMs() { return CHILD_SETTINGS.silenceTimeoutMs || (gentleMode() ? GENTLE_VAD.silenceTimeoutMs : VAD_SILENCE_TIMEOUT_MS); }
function vadMaxRecordMs() {
  // The cap must outlast one full end-of-phrase silence (tests/vad-config).
  const base = gentleMode() ? GENTLE_VAD.maxRecordMs : VAD_MAX_RECORD_MS;
  return Math.max(base, vadSilenceMs() + VAD_MIN_SPEECH_MS + 2000);
}
function maxReasks() { return CHILD_SETTINGS.maxReasks || (gentleMode() ? GENTLE_VAD.maxReasks : 1); }
function applyGentleClass() {
  document.body.classList.toggle("gentle", gentleMode());
}
// Decoration is skipped under either the OS setting or gentle mode.
function calmMotion() {
  return prefersReducedMotion() || gentleMode();
}

// One background image per "world" + a CSS overlay class per scene look
// (night / river / forest / cave / dawn / lesson) — see #sceneOverlay in story.html.
const SCENES = {
  night: { image: "/images/bg-fox.png", cls: "scene-night" },
  river: { image: "/images/bg-fox.png", cls: "scene-river" },
  forest: { image: "/images/bg-fox.png", cls: "scene-forest" },
  cave: { image: "/images/bg-owl.jpg", cls: "scene-cave" },
  dawn: { image: "/images/bg-fox.png", cls: "scene-dawn" },
  lesson: { image: "/images/bg-fox.png", cls: "scene-lesson" },
};

// Two stacked overlay layers cross-fade (see .scene-layer in
// design-system.css): the new look is painted on whichever layer is
// currently hidden, then the two swap opacity. Purely visual and
// synchronous — never awaited by the story flow.
const sceneLayers = [sceneOverlay, sceneOverlayNext];
let sceneFront = 0; // index of the layer currently visible
let currentSceneCls = "";
let currentSceneImage = "";
let sceneDipTimer = null; // pending "restore opacity" of the background swap

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
    if (first || calmMotion()) {
      // Reduced motion: swap the image outright, no dip to black.
      sceneStage.style.backgroundImage = `url(${sc.image})`;
      sceneStage.style.opacity = "1";
    } else {
      // Two quick swaps must not fight: the pending restore always belongs
      // to the newest dip.
      clearTimeout(sceneDipTimer);
      sceneStage.style.opacity = "0.15";
      sceneDipTimer = setTimeout(() => {
        sceneDipTimer = null;
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

// --- Letter-lesson stage supports (LESSON_A) ---------------------------
// The big letter (#letterOverlay) and the picture zone (#pictureOverlay).
// Pictures are hand-drawn SVG cards (public/images/lesson-a/), same flat
// style as characters.js. A "pick" question renders its `choices` as
// buttons: tapping one is a full answer (onPictureTap) — the alternative
// channel for a child who understands but does not (yet) vocalise.
const letterOverlay = document.getElementById("letterOverlay");
const pictureOverlay = document.getElementById("pictureOverlay");
const LESSON_PICTURES = {
  mouth: { src: "/images/lesson-a/mouth.svg", kk: "А-а-а", ru: "рот широко открыт" },
  alma: { src: "/images/lesson-a/alma.svg", kk: "алма", ru: "яблоко" },
  dop: { src: "/images/lesson-a/dop.svg", kk: "доп", ru: "мяч" },
  ana: { src: "/images/lesson-a/ana.svg", kk: "ана", ru: "мама" },
  // lesson «О» (LESSON_O)
  mouth_o: { src: "/images/lesson-o/mouth-o.svg", kk: "О-о-о", ru: "губы кругленькие" },
  ot: { src: "/images/lesson-o/ot.svg", kk: "от", ru: "огонь" },
  mysyq: { src: "/images/lesson-o/mysyq.svg", kk: "мысық", ru: "кошка" },
  oiynshyq: { src: "/images/lesson-o/oiynshyq.svg", kk: "ойыншық", ru: "игрушка" },
  // lesson «Ұ» (LESSON_U)
  mouth_u: { src: "/images/lesson-u/mouth-u.svg", kk: "Ұ-ұ-ұ", ru: "губы трубочкой" },
  ushaq: { src: "/images/lesson-u/ushaq.svg", kk: "ұшақ", ru: "самолёт" },
  unaidy: { src: "/images/lesson-u/unaidy.svg", kk: "ұнайды", ru: "нравится" },
};
// Tale picture cards come with each tale (story.js TALES[...].pictures).
for (const t of Object.values(TALES)) Object.assign(LESSON_PICTURES, t.pictures || {});

function pictureCardHTML(picId, { kk, ru, choiceId } = {}) {
  const pic = LESSON_PICTURES[picId];
  if (!pic) return "";
  const word = esc(kk ?? pic.kk);
  const sub = esc(ru ?? pic.ru);
  const inner = `<img src="${pic.src}" alt=""><span class="pic-word">${word}</span>${sub ? `<span class="pic-ru">${sub}</span>` : ""}`;
  return choiceId
    ? `<button type="button" class="pic-card" data-choice="${esc(choiceId)}" aria-label="${word}">${inner}</button>`
    : `<div class="pic-card">${inner}</div>`;
}

function renderLessonOverlays(s) {
  if (!letterOverlay || !pictureOverlay) return;
  const letter = s.letter || "";
  letterOverlay.textContent = letter;
  letterOverlay.classList.toggle("show", !!letter);
  letterOverlay.classList.toggle("chant", !!s.chant);
  letterOverlay.classList.remove("glow");
  sceneStage.classList.toggle("has-choices", s.kind === "question" && s.mode === "pick" && Array.isArray(s.choices));
  sceneStage.classList.toggle("has-picture", !!s.picture && !(s.kind === "question" && s.mode === "pick"));
  if (s.kind === "question" && s.mode === "pick" && Array.isArray(s.choices)) {
    pictureOverlay.className = "show two";
    pictureOverlay.innerHTML = s.choices.map((c) => pictureCardHTML(c.picture, { kk: c.kk, ru: c.ru, choiceId: c.id })).join("");
  } else if (s.picture) {
    pictureOverlay.className = "show";
    pictureOverlay.innerHTML = pictureCardHTML(s.picture);
  } else {
    pictureOverlay.className = "";
    pictureOverlay.innerHTML = "";
  }
}

// Soft "yes" on the letter itself — the lesson's replacement for sparkles.
function glowLetter() {
  if (!letterOverlay || !letterOverlay.classList.contains("show")) return;
  letterOverlay.classList.add("glow");
  setTimeout(() => letterOverlay.classList.remove("glow"), 1400);
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

// --- Lessons that live inside STORY (story.js LESSONS: letters, count,
// plus, minus, write) --------------------------------------------------
// Selected like every activity through ACTIVITY above; the start screen,
// the finale and the report skills come from ACTIVITIES, so nothing here
// needs to know which lesson it is.

// The count a "count" question expects: fixed on lesson nodes (`count`),
// rolled per session for the story's tracks.
function countForNode(id) {
  return NODES[id]?.count || trackCount;
}

// What a lesson node shows on the scene: a big letter and/or a row of apples.
// `slow` lands one apple per ~0.9 s so they appear as the fox counts aloud.
let lessonOverlay = null;
function renderLessonOverlay(spec) {
  if (!lessonOverlay) {
    lessonOverlay = document.createElement("div");
    lessonOverlay.id = "lessonOverlay";
    lessonOverlay.style.cssText =
      "position:absolute;left:0;right:0;top:6%;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:3;";
    document.getElementById("sceneStage").appendChild(lessonOverlay);
  }
  if (!spec) { lessonOverlay.innerHTML = ""; return; }
  const still = prefersReducedMotion();
  const letter = spec.letter
    ? `<div style="font:800 clamp(72px,22vw,150px)/1 system-ui,sans-serif;color:#fff;text-shadow:0 6px 18px rgba(46,32,19,.45),0 0 2px #c2410c;">${esc(spec.letter)}</div>`
    : "";
  // `plus: n` adds a "+" and n more apples after the base row; `minus: n`
  // fades the last n apples out once the row has landed ("the fox ate it").
  // `items` + `emoji` count anything (bees, stars, balloons); `apples` is the
  // lessons' original spelling of the same row.
  const base = spec.items || spec.apples || 0;
  const icon = spec.emoji || "🍎";
  const step = spec.slow ? 900 : 160;
  const size = "font-size:clamp(34px,9vw,58px);";
  const pop = (i) => (still ? "" : `opacity:0;animation:lessonPop 420ms ${i * step}ms both;`);
  const apple = (i) => {
    const eaten = spec.minus && i >= base - spec.minus;
    const inner = eaten
      ? `<span style="display:inline-block;${still ? "opacity:.25;filter:grayscale(1);" : `animation:lessonEaten 600ms ${base * step + 500}ms both;`}">${icon}</span>`
      : icon;
    return `<span style="${size}filter:drop-shadow(0 4px 8px rgba(46,32,19,.35));${pop(i)}">${inner}</span>`;
  };
  let row = Array.from({ length: base }, (_, i) => apple(i)).join("");
  if (spec.plus) {
    row += `<span style="${size}font-weight:800;color:#fff;text-shadow:0 3px 8px rgba(46,32,19,.5);${pop(base)}">+</span>`;
    row += Array.from({ length: spec.plus }, (_, i) =>
      `<span style="${size}filter:drop-shadow(0 4px 8px rgba(46,32,19,.35));${pop(base + 1 + i)}">🍎</span>`).join("");
  }
  lessonOverlay.innerHTML = letter + (row ? `<div style="display:flex;gap:10px;align-items:center;">${row}</div>` : "");
}

// --- Trace lesson (STORY kind "trace") --------------------------------
// The letter is a few straight strokes in a 0..1 box. Checkpoints are
// sampled along them; the child's finger "collects" every checkpoint it
// passes near, and the letter counts as written at TRACE_DONE_RATIO. Loose
// on purpose: a 4-year-old's line wobbles, and failing them here teaches
// nothing.
const TRACE_STROKES = {
  "А": [
    [[0.5, 0.1], [0.2, 0.9]],
    [[0.5, 0.1], [0.8, 0.9]],
    [[0.31, 0.62], [0.69, 0.62]],
  ],
};
const TRACE_DONE_RATIO = 0.85;
const TRACE_IDLE_MS = 45000;
let traceCanvas = null;
let traceState = null;

function tracePoints(strokes) {
  const pts = [];
  strokes.forEach(([[x1, y1], [x2, y2]], stroke) => {
    const n = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) * 12));
    for (let i = 0; i <= n; i++) pts.push({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n, hit: false, stroke });
  });
  return pts;
}

function stopTrace() {
  if (traceState) clearTimeout(traceState.idleTimer);
  traceState = null;
  if (traceCanvas) traceCanvas.style.display = "none";
}

function startTrace(id) {
  const s = NODES[id];
  const strokes = TRACE_STROKES[s.letter];
  if (!strokes) { renderState(s.onReveal); return; }
  const stage = document.getElementById("sceneStage");
  if (!traceCanvas) {
    traceCanvas = document.createElement("canvas");
    traceCanvas.id = "traceCanvas";
    traceCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:4;touch-action:none;cursor:crosshair;";
    stage.appendChild(traceCanvas);
    traceCanvas.addEventListener("pointerdown", (e) => { if (traceState) { traceState.down = true; traceState.last = null; traceCanvas.setPointerCapture(e.pointerId); traceMove(e); } });
    traceCanvas.addEventListener("pointermove", (e) => { if (traceState?.down) traceMove(e); });
    const up = () => { if (traceState) { traceState.down = false; traceState.last = null; } };
    traceCanvas.addEventListener("pointerup", up);
    traceCanvas.addEventListener("pointercancel", up);
  }
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  traceCanvas.width = Math.round(rect.width * dpr);
  traceCanvas.height = Math.round(rect.height * dpr);
  traceCanvas.style.display = "block";
  // The letter sits in a centred square box so it keeps its proportions on
  // any scene aspect ratio.
  const side = Math.min(rect.width, rect.height) * 0.9;
  traceState = {
    id, strokes, points: tracePoints(strokes), down: false, last: null, drawn: [],
    w: rect.width, h: rect.height, dpr, side,
    ox: (rect.width - side) / 2, oy: (rect.height - side) / 2,
    idleTimer: null,
  };
  armTraceIdle();
  drawTrace();
}

function armTraceIdle() {
  clearTimeout(traceState.idleTimer);
  const id = traceState.id;
  traceState.idleTimer = setTimeout(() => {
    if (currentId !== id || !traceState) return;
    log("trace: нет касаний → reveal");
    finishTrace("reveal");
  }, TRACE_IDLE_MS);
}

function traceMove(e) {
  const t = traceState;
  const r = traceCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (t.last) t.drawn.push([t.last.x, t.last.y, x, y]);
  t.last = { x, y };
  const reach = t.side * 0.08;
  for (const p of t.points) {
    if (!p.hit && Math.hypot(t.ox + p.x * t.side - x, t.oy + p.y * t.side - y) <= reach) p.hit = true;
  }
  armTraceIdle();
  drawTrace();
  // Every stroke on its own: the crossbar of «А» lies between the legs, so a
  // whole-letter ratio was already satisfied by the two legs alone.
  const done = t.strokes.every((_, i) => {
    const pts = t.points.filter((p) => p.stroke === i);
    return pts.filter((p) => p.hit).length / pts.length >= TRACE_DONE_RATIO;
  });
  if (done) finishTrace("correct");
}

function drawTrace() {
  const t = traceState;
  const ctx = traceCanvas.getContext("2d");
  ctx.setTransform(t.dpr, 0, 0, t.dpr, 0, 0);
  ctx.clearRect(0, 0, t.w, t.h);
  ctx.fillStyle = "rgba(255,247,235,0.86)";
  ctx.fillRect(0, 0, t.w, t.h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const px = (p) => [t.ox + p[0] * t.side, t.oy + p[1] * t.side];
  // guide: wide soft track + dashed centre line
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(194,65,12,0.16)";
  ctx.lineWidth = t.side * 0.13;
  for (const [a, b] of t.strokes) line(...px(a), ...px(b));
  ctx.setLineDash([t.side * 0.03, t.side * 0.05]);
  ctx.strokeStyle = "rgba(194,65,12,0.55)";
  ctx.lineWidth = Math.max(2, t.side * 0.015);
  for (const [a, b] of t.strokes) line(...px(a), ...px(b));
  // the child's line
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = t.side * 0.07;
  for (const [x1, y1, x2, y2] of t.drawn) line(x1, y1, x2, y2);
  // start dot of the first stroke — "put your finger here"
  if (!t.drawn.length) {
    const [sx, sy] = px(t.strokes[0][0]);
    ctx.fillStyle = "#16a34a";
    ctx.beginPath(); ctx.arc(sx, sy, t.side * 0.045, 0, Math.PI * 2); ctx.fill();
  }
}

function finishTrace(verdict) {
  const id = traceState.id;
  const s = NODES[id];
  stopTrace();
  Session.answer({ nodeId: id, transcript: "", verdict, source: "trace" });
  if (verdict === "correct") burstSparkles();
  renderState(verdict === "correct" ? s.onCorrect : s.onReveal);
}

// --- Child-facing feedback (fire-and-forget) --------------------------
// Everything below is decoration: it is called for its side effect and
// never awaited, so a failure (no WebAudio, no GSAP, blocked autoplay)
// can't stall advanceFromQuestion / renderState / the VAD pipeline.
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function burstSparkles() {
  if (!heroStage || calmMotion() || typeof sparkleVectors !== "function") return;
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
    // Normally the context already exists: the Бастау tap calls
    // ensureMicStream(), which creates it inside a real user gesture. Keep
    // that prefetch — a context created here first may start suspended.
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
  if (!heroStage || calmMotion()) return;
  // Shake the .hero-inner wrapper, never .fox-pose (animateFoxPose keeps
  // infinite idle tweens on it — a second rotation tween there fights them and
  // leaves the fox tilted) and never #heroStage itself (its CSS keyframes own
  // `transform`, including the translateX(-50%) that centres it).
  const target = heroStage.querySelector(".hero-inner") || heroStage.firstElementChild;
  if (!target) return;
  if (typeof gsap !== "undefined") {
    gsap.set(target, { transformOrigin: "bottom center" });
    gsap.fromTo(
      target,
      { rotation: 0 },
      {
        rotation: 4, duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut",
        overwrite: "auto", onComplete: () => gsap.set(target, { rotation: 0 }),
      },
    );
    return;
  }
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
let pendingEchoFinish = null; // resolves the promise scheduleEcho() handed out

// Drop a scheduled-but-not-yet-played echo (new line, reset, or the main line
// that never fired `ended`) and settle its promise so nobody awaits forever.
function cancelPendingEcho() {
  if (pendingEchoHandler) {
    heroVoice.removeEventListener("ended", pendingEchoHandler);
    pendingEchoHandler = null;
  }
  if (pendingEchoFinish) pendingEchoFinish();
}

// Returns a promise that resolves when the echo has actually FINISHED playing
// (or could never play). The mic must not be armed before that, or the VAD
// hears the fox's own echo and "answers" for the child.
function scheduleEcho(src) {
  if (!heroEcho || !src) return Promise.resolve();
  cancelPendingEcho();
  return new Promise((resolve) => {
    let done = false;
    let leash = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(leash);
      heroEcho.removeEventListener("ended", finish);
      heroEcho.removeEventListener("error", finish);
      heroEcho.removeEventListener("loadedmetadata", onMeta);
      if (pendingEchoFinish === finish) pendingEchoFinish = null;
      resolve();
    };
    const armLeash = () => {
      clearTimeout(leash);
      const d = heroEcho.duration;
      leash = setTimeout(finish, Number.isFinite(d) && d > 0 ? d * 1000 + 1500 : 8000);
    };
    const onMeta = () => armLeash();
    pendingEchoFinish = finish;
    const onEnded = () => {
      heroVoice.removeEventListener("ended", onEnded);
      if (pendingEchoHandler === onEnded) pendingEchoHandler = null;
      setTimeout(() => {
        if (done) return;
        try {
          heroEcho.src = src;
          heroEcho.volume = 0.35;
          heroEcho.playbackRate = 0.95;
          heroEcho.addEventListener("ended", finish);
          heroEcho.addEventListener("error", finish);
          heroEcho.addEventListener("loadedmetadata", onMeta);
          armLeash();
          const p = heroEcho.play();
          // autoplay refused — silent, the line was already heard
          if (p && p.catch) p.catch(() => finish());
        } catch (err) {
          finish(); /* echo is decoration; never surface it */
        }
      }, 450);
    };
    pendingEchoHandler = onEnded;
    heroVoice.addEventListener("ended", onEnded);
  });
}

async function playWithTimeout(ms) {
  const playTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`play() timed out after ${ms}ms`)), ms),
  );
  await Promise.race([heroVoice.play(), playTimeout]);
}

// play() only resolves when playback STARTS. The story (narration
// auto-advance, arming the mic for a question) must wait for the line to be
// actually SPOKEN, or every line is cut off after a few hundred ms. The leash
// keeps a stalled/broken element from parking the demo forever.
function awaitLineEnd() {
  const d = heroVoice.duration;
  // A broken/empty blob has duration NaN or 0 — a 10s leash is the longest
  // the demo may ever sit silent, not the default wait.
  const leashMs = Number.isFinite(d) && d > 0 ? Math.min(20000, d * 1000 + 2000) : 10000;
  return new Promise((resolve) => {
    // `ended` may already have fired (very short line, or a replayed element):
    // never park on an event that will not come again.
    if (heroVoice.ended || heroVoice.error) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      heroVoice.removeEventListener("ended", finish);
      heroVoice.removeEventListener("error", finish);
      resolve();
    };
    const timer = setTimeout(finish, leashMs);
    heroVoice.addEventListener("ended", finish);
    heroVoice.addEventListener("error", finish);
  });
}

// Every line plays its pre-rendered file first (public/audio/<stateId>.wav —
// Piper via tools/prerender.py, or per-hero VoiceStudio voices via
// tools/prerender_voicestudio.py). Live Piper (/api/speak, local server
// only) is the fallback for a line with no file yet; with neither, the text
// stays up for its reading time. File-first means the voices chosen for the
// heroes are what the child hears everywhere — not only on the deployed site
// where /api/speak does not exist — and no line waits on a synthesis call.
// The echo only ever starts on heroVoice's `ended` event. If the line
// finished on its leash instead (broken blob, stalled element), the echo will
// never play — settle it right away rather than waiting out its own leash.
function settleEcho(echoDone) {
  if (!echoDone) return Promise.resolve();
  if (!heroVoice.ended) { cancelPendingEcho(); return Promise.resolve(); }
  return echoDone;
}

// When neither live TTS nor a pre-rendered .wav exists for a line (lesson
// lines before tools/prerender.py has run, a fresh Vercel deploy), the text
// is all the child gets — so hold the beat for about as long as the fox
// would have taken to say it, instead of flashing narration past in 500 ms.
function readingTimeMs(text) {
  return Math.min(9000, Math.max(1500, 70 * String(text || "").length));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let speakGen = 0; // bumped per line so a late awaitLineEnd/echo can be ignored
function stopEchoPlayback() {
  cancelPendingEcho();
  try {
    heroEcho.pause();
    heroEcho.currentTime = 0;
    heroEcho.removeAttribute("src");
    heroEcho.load();
  } catch { /* no echo element / nothing loaded */ }
}

// Awaits the echo too when the node has one: the resolved promise means
// "the fox has stopped making noise", which is what arming the mic waits on.
async function playClip(src, echo) {
  heroVoice.src = src;
  const echoDone = echo && ECHO_IDS.has(currentId) ? scheduleEcho(heroVoice.src) : null;
  // play() can hang indefinitely instead of rejecting in some browser/
  // automation contexts — never let audio playback stall the demo.
  await playWithTimeout(3000);
  await awaitLineEnd();
  await settleEcho(echoDone);
}

async function speakLive(text, echo) {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 2500);
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: controller.signal,
  });
  clearTimeout(abortTimer);
  if (!res.ok) throw new Error(`live TTS ${res.status}`);
  const ms = res.headers.get("X-Synth-Ms");
  // The echo replays this very same object URL — do not revoke it while an
  // echo may still be playing (it outlives the main line by ~0.45s + its
  // own duration).
  await playClip(URL.createObjectURL(await res.blob()), echo);
  return ms;
}

async function speakLine(text, stateId, { echo = false } = {}) {
  speakGen++;
  // An operator override can switch nodes mid-line — the new line must cut
  // the old one (and any pending/playing echo of it) off instead of talking
  // over it.
  try { heroVoice.pause(); heroVoice.currentTime = 0; } catch { /* no media loaded yet */ }
  stopEchoPlayback();
  if (!text) return;
  setStage("tts", "running", "");
  let fileErr = null;
  if (stateId) {
    try {
      await playClip(`/audio/${stateId}.wav`, echo);
      log(`voice: /audio/${stateId}.wav`);
      setStage("tts", "ok", "wav");
      return;
    } catch (err) {
      fileErr = err;
    }
  }
  try {
    const ms = await speakLive(text, echo);
    log(`voice: live "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}" (${ms}ms synth${fileErr ? `; wav: ${fileErr.message}` : ""})`);
    setStage("tts", "skip", `${ms}ms live`);
  } catch (err) {
    // Neither a file nor live synthesis: the text is all the child gets.
    log(`voice error: ${fileErr ? `wav ${fileErr.message}; ` : ""}live ${err.message} — держу реплику ${readingTimeMs(text)}мс текстом`);
    if (stateId) noteError(`voice: /audio/${stateId}.wav — ${(fileErr || err).message}`, "speakLine");
    setStage("tts", "err", "no wav, no live");
    await sleep(readingTimeMs(text));
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
// iOS/WebKit: one MediaStreamTrack read by a Web Audio AnalyserNode AND
// recorded by a MediaRecorder at the same time can silently produce
// zero-byte output on Safari (found on a real iPhone during the pitch week).
// On iOS the recorder therefore gets its OWN getUserMedia stream; everywhere
// else this is the same object as vadStream, so nothing changes.
let vadRecordStream = null;
let vadAudioCtx = null;
let vadAnalyser = null;
let vadFloatBuf = null;
let vadFrameId = null;
let vadRecorder = null;
let vadRecording = false;
let vadArmed = false; // true only while the current question hasn't been answered yet
let vadSpeechStartedAt = 0;
let vadLastLoudAt = 0;

// Tuned for 3-7-year-olds (quieter than adults, pause mid-phrase). These are
// the values the user measured on a real phone during the pitch week, and
// they beat the desk-guessed ones they replace:
//   start 0.014 → 0.035  — under a phone's mic AGC, 0.02 and below
//                          self-triggered on ambient room noise, opening
//                          empty/garbage turns nobody spoke into.
//   silence 0.009 → 0.02 — matching hysteresis below the start bar.
//   silence 1400 → 1700  — 1000 ms cut a child off mid-count, between
//                          «бір… екі…»; 1700 leaves room for that pause.
//   max 8000 → 10000     — hard cap raised to match the longer silence
//                          tolerance, so a real answer still fits.
// VAD_MIN_SPEECH_MS stays at 300 (master used 400): the pre-roll buffer
// below means a short «да»/«екі» is already captured from before the gate
// tripped, and 400 was dropping exactly those valid one-word answers.
// TO RE-TUNE: the start threshold was measured BEFORE the
// noiseSuppression/autoGainControl constraints below were added, and those
// change the level that reaches the analyser. Re-measure in /lab.html on
// real child recordings rather than nudging these by feel.
const VAD_START_RMS = 0.035;
const VAD_SILENCE_RMS = 0.02;
const VAD_SILENCE_MS = 1700;
const VAD_MIN_SPEECH_MS = 300;
const VAD_MAX_RECORD_MS = 10000;
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

// If the child never speaks at all, rms never crosses VAD_START_RMS, so the
// turn never "starts" and VAD_MAX_RECORD_MS (which only bounds an ALREADY
// started recording) never applies — the mic would stay armed forever with
// zero feedback. This timer covers exactly that total-silence case, and it
// routes into the same markReask() ladder a wrong or unclear spoken answer
// already uses (1st time → hint, 2nd time on the same question →
// auto-reveal), so it needs no new story.js content.
let vadSilenceTimer = null;
const VAD_SILENCE_TIMEOUT_MS = 8000;

function cancelVadSilenceTimer() {
  if (vadSilenceTimer) {
    clearTimeout(vadSilenceTimer);
    vadSilenceTimer = null;
  }
}

// A child sits further from the laptop than an adult and speaks quieter, on
// top of whatever the room is doing. The browser's own AEC/NS/AGC chain is
// far better at that than anything we can do after the fact — and AGC in
// particular lifts a quiet voice before it ever reaches the encoder, where
// the server-side loudnorm can only work with what was captured. Mono
// because Whisper downmixes anyway.
const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

// iPadOS 13+ reports itself as "MacIntel" with a touch screen, so the UA
// string alone misses iPads — hence the maxTouchPoints half of the check.
function isIOSWebKit() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Builds the Web Audio analyser chain over `stream` and installs it as the
// one the VAD loop reads. Split out so the onmute/onended fallback below can
// re-point the analyser at the surviving stream without re-running the whole
// acquisition.
function attachAnalyser(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!vadAudioCtx) vadAudioCtx = new AudioCtx(); // may already exist from playDing()
  const source = vadAudioCtx.createMediaStreamSource(stream);
  const analyser = vadAudioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  vadAnalyser = analyser;
  vadFloatBuf = new Float32Array(analyser.fftSize);
}

// UNVERIFIED ON A REAL DEVICE — check before the pitch. On WebKit a second
// concurrent capture can mute/end an already-open track. The long-lived
// analyser stream is what the whole session's VAD depends on (the recording
// stream is re-read per arm), so: watch the analyser track and, if it dies,
// fall back to the recorder's stream rather than going silently deaf. With a
// single shared stream (everywhere but iOS) there is nothing to fall back to
// — log it and let the manual recordBtn override carry the turn.
function watchAnalyserTrack(stream) {
  const track = stream.getAudioTracks()[0];
  if (!track) return;
  const onLost = () => {
    log(`VAD: аналайзер-трек ${track.readyState === "ended" ? "завершён" : "заглушён"} браузером`);
    if (vadRecordStream && vadRecordStream !== stream) {
      try {
        attachAnalyser(vadRecordStream);
        vadStream = vadRecordStream;
        log("VAD: переключился на второй (записывающий) поток");
        return;
      } catch (err) {
        log(`VAD: переключение не удалось: ${err.name || err.message}`);
      }
    }
    setStage("mic", "err", "поток заглушён");
    log("VAD недоступен — используй ручную кнопку записи");
  };
  track.onmute = onLost;
  track.onended = onLost;
}

async function ensureMicStream() {
  if (vadStream) return vadStream;
  // iOS/WebKit gets TWO streams (see the note on vadRecordStream). The
  // RECORDING one is requested FIRST on purpose: if a later concurrent
  // capture mutes one of the tracks, it should be the short-lived recorder
  // stream (reacquired per arm anyway), not the analyser stream the whole
  // session's VAD hangs off.
  let recordStream = null;
  if (isIOSWebKit()) {
    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    } catch (err) {
      // Don't let a failed SECOND stream poison the whole function: falling
      // back to one shared stream is exactly the non-iOS behaviour. Letting
      // this reject after vadStream was set was what killed the analyser for
      // the rest of the session.
      recordStream = null;
      log(`VAD: второй (записывающий) поток недоступен, один общий: ${err.name || err.message}`);
    }
  }
  const analyserStream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  // Analyser built BEFORE anything module-level is assigned: vadStream must
  // never be set with an uninitialised analyser, or `if (vadStream) return`
  // short-circuits every future call and the VAD is dead for the session.
  attachAnalyser(analyserStream);
  vadStream = analyserStream;
  vadRecordStream = recordStream || analyserStream;
  watchAnalyserTrack(analyserStream);
  return vadStream;
}

function currentRMS() {
  vadAnalyser.getFloatTimeDomainData(vadFloatBuf);
  let sum = 0;
  for (let i = 0; i < vadFloatBuf.length; i++) sum += vadFloatBuf[i] * vadFloatBuf[i];
  return Math.sqrt(sum / vadFloatBuf.length);
}

// Everything the hero shows lives inside .hero-inner: #heroStage itself is
// owned by the idle CSS keyframes (heroBreathe/heroBounce include the
// translateX(-50%) that positions it), so one-off tweens like heroShake need
// their own element to transform. animateFoxPose still finds .fox-pose below.
function setHeroHTML(html) {
  heroStage.innerHTML = `<div class="hero-inner">${html}</div>`;
}

// --- Hero rendering: Rive-first for the fox, DOM-rebuild fallback otherwise ---
// Rive drives the fox off ONE persistent canvas + state machine
// ("State Machine 1": pose 0-4, talkLevel 0-1, see docs/rive-fox-rig-spec.md)
// so a pose change is just an input update, not a teardown/rebuild — that is
// what keeps the idle breathing/blink loop running continuously across story
// beats instead of restarting on every line. It falls back to the pre-Rive
// video/GSAP pose art (foxPoseHTML/animateFoxPose) whenever the CDN, the WASM
// runtime, or public/rive/fox.riv itself isn't there — mountFoxRive's onFail
// below. public/rive/fox.riv does NOT exist yet (the rig still has to be
// built in the Rive editor per the spec), so today every run takes the
// fallback path and looks exactly as it did before this change. The owl and
// the bear are still hand-coded SVG with no rig, so they always rebuild.
let heroMountKey = null; // character + brother: a change means a real rebuild

function heroKeyOf(node) {
  if (!node) return null;
  return `${node.character || "fox"}:${node.showBrother ? 1 : 0}`;
}

function renderHeroFallback(node) {
  setHeroHTML(renderHero(node));
  if ((node.character || "fox") === "fox") animateFoxPose(heroStage, node.pose || "idle");
}

function setHero(node) {
  const key = heroKeyOf(node);
  const pose = node?.pose || "idle";

  if (key !== heroMountKey) {
    unmountFoxRive();
    heroMountKey = key;
    if (!node) { heroStage.innerHTML = ""; return; }
    if ((node.character || "fox") !== "fox") { renderHeroFallback(node); return; }
    // The canvas lives inside .hero-inner like every other hero, so the
    // idle CSS keyframes and heroShake keep working untouched.
    setHeroHTML(`<canvas class="fox-pose fox-rive"></canvas>${node.showBrother ? brotherHTML() : ""}`);
    mountFoxRive(heroStage.querySelector(".fox-rive"), pose, () => {
      // .riv missing/blocked/contract mismatch — drop back to the pre-Rive
      // renderer for as long as this hero stays mounted.
      if (heroMountKey === key && !isFoxRiveActive()) renderHeroFallback(node);
    });
    return;
  }

  if ((node.character || "fox") === "fox" && isFoxRiveActive()) {
    setFoxRivePose(pose); // same mount, just a new input value
    return;
  }
  // Still loading (pendingPose covers it once it resolves) or already fell
  // back — the fallback art has no state machine listening for pose changes,
  // so it needs its own re-render.
  setFoxRivePose(pose);
  renderHeroFallback(node);
}

function setHeroPoseOverride(pose) {
  const node = NODES[currentId] || { character: "fox" };
  setHero({ ...node, pose });
}

// TTS-driven mouth amplitude for the Rive fox's talkLevel input — mirrors
// the VAD mic analyser above, but reads the hero's OWN voice (heroVoice)
// instead of the mic, so the state machine's mouth-open blend tracks the
// actual audio rather than a fixed-rate flap loop. Does nothing at all
// unless Rive is actually driving the fox, which is also what keeps it from
// routing heroVoice through Web Audio on today's fallback-only path.
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
  source.connect(ttsAudioCtx.destination); // keep audible — an analyser alone is a silent tap
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

const listenCue = document.getElementById("listenCue");

// The child is never told to press anything, so the screen has to say
// "I'm listening" by itself — a calm caption, not a blinking alert.
function setListenCue(listening, recording) {
  if (!listenCue) return;
  listenCue.classList.toggle("show", listening);
  listenCue.classList.toggle("recording", listening && recording);
  const text = listenCue.querySelector(".turn-text");
  if (listening && text) text.textContent = recording ? "Естіп тұрмын!" : "Сенің кезегің";
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
  if (listenCue) listenCue.style.setProperty("--amp", String(level));
}

function startVadRecorder() {
  const mimeType = pickMimeType();
  const stream = vadRecordStream || vadStream; // recorder-only stream on iOS, see vadRecordStream
  vadRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
  cancelVadSilenceTimer(); // speech began — the total-silence timeout no longer applies to this turn
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
  cancelVadSilenceTimer();
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
  // Started here, not when the question was rendered: arming happens only
  // after the hero's voice line has actually ended (see speakLine), so these
  // 8 s are 8 s of the CHILD being silent, not of the fox still talking.
  cancelVadSilenceTimer();
  vadSilenceTimer = setTimeout(() => {
    vadSilenceTimer = null;
    if (!vadArmed || vadRecording) return; // question already left, or speech already started
    log(`VAD: ${vadSilenceTimeoutMs() / 1000}с полной тишины — переспрашиваю автоматически (без ручного клика)`);
    markReask("тишина (авто)");
  }, vadSilenceTimeoutMs());
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
    micUnavailable = true;
    micErrorName = err.name || "";
    noteError(`mic: ${err.name || ""} ${err.message || ""}`.trim(), "getUserMedia");
    showJudgeBar("mic");
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
  cancelVadSilenceTimer(); // called by renderState on every transition, so this covers leaving the question too
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

  if (sinceStart > vadMaxRecordMs()) {
    finishVadTurn();
  } else if (sinceStart > VAD_MIN_SPEECH_MS && sinceLoud > vadSilenceMs()) {
    finishVadTurn();
  }
}
vadFrameId = requestAnimationFrame(vadLoop);

// --- story state ---
let currentId = null;
let reaskCount = 0; // per-question re-asks so far; maxReasks() (1, or 2 in gentle mode) before auto-reveal (design doc "third strike")
// fox_reask/owl_reask loop back into the SAME question id, which used to
// re-trigger the "reaskCount = 0" reset below on every re-render —
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

// --- «Ата-ана бағалайды»: the adult judges the answer -------------------
// Voice answers need the network (speech recognition runs on the server).
// Without it — or without a microphone, or when recognition keeps failing —
// the child must not get stuck on the first question: the hero still asks,
// and the adult next to the child taps «Айтты» / «Тағы» on a big bar under
// the speech bubble. A child profile can also ask for this ALWAYS
// (settings.judge = "adult"): for severe speech impairments a therapist's
// ear is more reliable than any recogniser. Picture cards stay tappable for
// the child either way. Answers are recorded with source "adult".
const judgeBar = document.getElementById("judgeBar");
const judgeButtons = document.getElementById("judgeButtons");
const judgeWhy = document.getElementById("judgeWhy");
const STT_FAILS_FOR_ADULT = 2; // consecutive recognition failures before the bar stays on
let sttFailStreak = 0;
let micUnavailable = false;
let micErrorName = "";
const judgeHint = document.getElementById("judgeHint");
// What the adult can do about it — shown once per reason under the buttons.
// Phrased for a phone or tablet (the pilot devices), not for a laptop.
function judgeHintText(reason) {
  if (reason === "offline") return "Интернет жоқ: жауапты сіз бағалайсыз. Интернет пайда болғанда микрофон қайта қосылады. · Нет интернета — ответ оцениваете вы; с интернетом микрофон включится снова.";
  if (reason === "stt") return "Сөйлеуді тану уақытша істемейді. · Распознавание речи сейчас не отвечает — оцените ответ сами.";
  if (reason === "mic") {
    if (micErrorName === "NotAllowedError" || micErrorName === "SecurityError") {
      return "Микрофонға рұқсат жоқ. · Доступ к микрофону запрещён: нажмите 🔒 или ⓘ слева от адреса сайта → Микрофон → Разрешить, затем обновите страницу.";
    }
    if (micErrorName === "NotFoundError" || micErrorName === "OverconstrainedError") return "Микрофон табылмады. · Микрофон не найден — подключите гарнитуру или используйте другое устройство.";
    if (micErrorName === "NotReadableError") return "Микрофонды басқа қолданба алып тұр. · Микрофон занят другим приложением (звонок, запись) — закройте его и обновите страницу.";
    return "Микрофон қосылмады. · Микрофон не включился — ответы оценивает взрослый.";
  }
  return "";
}
let judgeHintShown = "";
const BRANCH_LABELS = {
  river: { kk: "🌊 Өзен", ru: "река" },
  forest: { kk: "🌲 Орман", ru: "лес" },
};
const JUDGE_WHY = {
  setting: "👂",
  offline: "📴 Интернет жоқ ·",
  mic: "🎙️✕ Микрофон жоқ ·",
  stt: "📶 Байланыс әлсіз ·",
};

// Pilot diagnostics (errlog.js): failures the adult never sees as an error
// but the developer needs — recognition down, mic refused.
function noteError(msg, src) {
  try {
    if (typeof ErrLog !== "undefined") ErrLog.note(msg, { src, page: location.pathname + location.search, version: localStorage.getItem("ertegim.version") || "" });
  } catch { /* diagnostics are best-effort */ }
}

function adultJudgeReason() {
  if (CHILD_SETTINGS.judge === "adult") return "setting";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (micUnavailable) return "mic";
  if (sttFailStreak >= STT_FAILS_FOR_ADULT) return "stt";
  return null;
}

function hideJudgeBar() {
  if (!judgeBar) return;
  judgeBar.classList.remove("show");
  judgeButtons.innerHTML = "";
}

function showJudgeBar(reason) {
  if (!judgeBar || storyEnded) return;
  const s = NODES[currentId];
  if (!s || s.kind !== "question") return;
  judgeWhy.textContent = JUDGE_WHY[reason] || "";
  // The mic button is the operator's override; next to the adult's bar it
  // only suggests «press to talk», which is exactly what does not work now.
  recordBtn.style.display = "none";
  const hint = judgeHintText(reason);
  // Explain each reason once per session, not on every question.
  if (judgeHint) {
    judgeHint.hidden = !hint || judgeHintShown.includes(`|${reason}|`);
    judgeHint.textContent = hint;
    judgeHintShown += `|${reason}|`;
  }
  const btn = (cls, data, kk, ru) => `<button type="button" class="judge-btn ${cls}" data-judge="${data}">${kk}<small>${ru}</small></button>`;
  const yes = s.mode === "branch"
    ? Object.keys(s.onAnswer || {}).map((r) => btn("route", `route:${r}`, (BRANCH_LABELS[r] || { kk: r }).kk, (BRANCH_LABELS[r] || { ru: "" }).ru)).join("")
    : btn("yes", "correct", "✅ Айтты", "сказал(а)");
  judgeButtons.innerHTML = yes + btn("again", "reask", "🔁 Тағы бір рет", "ещё раз");
  judgeBar.classList.add("show");
  log(`ата-ана бағалайды (${reason}): микрофон не слушает, ответ оценивает взрослый`);
}

function onJudge(action) {
  if (storyEnded || !currentId) return;
  const s = NODES[currentId];
  if (!s || s.kind !== "question") return;
  judgeButtons.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  cancelAiAutoAdvance();
  disarmVad();
  if (!lastTranscript) lastTranscript = "👂 ата-ана";
  if (!recordingStartedAt) recordingStartedAt = Date.now();
  if (action === "reask") { markReask("adult"); return; }
  if (action.startsWith("route:")) pendingRoute = action.slice(6);
  if (s.mode === "pick") pendingChoice = Object.keys(s.onAnswer || {})[0] || null;
  markCorrect("adult");
}
judgeButtons?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-judge]");
  if (b && !b.disabled) onJudge(b.dataset.judge);
});

function renderState(id) {
  // Soft session cap: past the limit, any non-final beat jumps straight to
  // the finale instead of cutting the child off mid-story.
  if (!ACTIVITY.finalIds.has(id) && Session.overLimit()) {
    log(`лимит сессии (8 мин) → ${ACTIVITY.limitTarget}`);
    id = ACTIVITY.limitTarget;
  }
  currentId = id;
  if (id === "q_tracks" && activeQuestionId !== id) rerollTracks();
  if (id === "q_echo" && activeQuestionId !== id) rerollBrotherName();
  const s = NODES[id];

  cancelAiAutoAdvance();
  cancelNarrationAutoAdvance();
  disarmVad();
  hideJudgeBar();
  aiVerdictEl.classList.remove("show");
  blockedFlash.classList.remove("show", "materialize-in");
  resultEl.classList.remove("show", "materialize-in");
  statusText.textContent = "";
  thinkingDots.hidden = true;

  renderLessonOverlay(s.overlay || null);
  stopTrace();

  if (id === "parent_report") {
    storySpeaker.textContent = "";
    storyKk.textContent = "";
    storyRu.textContent = "";
    setHero(null);
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
    revealStickers(Stickers.award(stickersFor(ACTIVITY.id, lastSummary)));
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
  renderLessonOverlays(s);

  storySpeaker.textContent = s.speaker;
  storyKk.textContent = s.kk;
  storyRu.textContent = s.ru;
  setHero(s);
  // Back at a question after its re-ask line: the re-ask already said what to
  // do, so the question is shown but NOT spoken a second time — the mic opens
  // straight away. Hearing the same question twice in a row (ask, re-ask,
  // ask again) was the slow, boring part of a wrong answer.
  const repeatAfterReask = s.kind === "question" && activeQuestionId === id && reaskCount > 0;
  const speakDone = repeatAfterReask
    ? speakLine("", null)
    : speakLine(s.kk, audioIdFor(id), { echo: ECHO_IDS.has(id) });
  const gen = speakGen; // a line started later must win over this one's tail

  if (id === "found") Session.moment("інісін тапты");
  if (id === "cave_enter") Session.moment("түлкіге батылдық берді");
  if (id === "la_ok") Session.moment("А әрпін айтты");
  if (id === "lc_ok") Session.moment("беске дейін санады");
  if (id === "lp_ok") Session.moment("екіге бірді қосты");
  if (id === "lm_ok") Session.moment("төрттен бірді азайтты");
  if (id === "lw_ok") Session.moment("А әрпін жазды");
  if (id === "o_sound_ok") Session.moment("О дыбысын айтты");
  if (id === "u_sound_ok") Session.moment("Ұ дыбысын айтты");

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
      if (currentId !== id || gen !== speakGen || !next) return;
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
    pendingChoice = null;
    // The same reset applies to everything the previous answer left behind:
    // a stale lastRoute would otherwise decide THIS question's branch.
    lastAlternatives = [];
    lastLowConfidence = false;
    lastRoute = null;
    lastTranscript = "";
    recordingStartedAt = 0;
    nextBtn.style.display = "none";
    // In «the adult judges» mode the mic never opens — do not show it even
    // while the hero is still speaking (showJudgeBar hides it later anyway).
    recordBtn.style.display = adultJudgeReason() ? "none" : "flex";
    recordBtn.disabled = false;
    recordBtn.textContent = "🎙";
    recordBtn.title = "Слушаю… (нажми, если ребёнок уже ответил)";
    recordBtn.setAttribute("aria-label", recordBtn.title);
    recordBtn.classList.remove("recording");
    uploadRow.style.display = "block";
    if (activeQuestionId !== id) {
      reaskCount = 0;
      activeQuestionId = id;
    }
    Session.questionShown(id, s.skill, reaskCount + 1);
    // Arm the mic only once the question has been spoken — otherwise the mic
    // hears the hero's own voice from the speakers and trips the VAD.
    speakDone.then(() => {
      if (currentId !== id || gen !== speakGen) return;
      const why = adultJudgeReason();
      if (why) { showJudgeBar(why); return; }
      armVadForQuestion();
      log("mic armed after line");
    });
  } else if (s.kind === "trace") {
    // No mic here: the answer is the finger on the scene. The canvas is live
    // straight away — the child need not wait for the fox to finish talking.
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    Session.questionShown(id, s.skill, 1);
    startTrace(id);
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
  const s = NODES[currentId];
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

// New stickers from this run pop in on the end screen, one after another.
// Earlier-earned ones are not repeated here — the library shelf shows the
// whole collection.
function revealStickers(ids) {
  const box = document.getElementById("endStickers");
  const row = document.getElementById("endStickerRow");
  if (!box || !row) return;
  row.innerHTML = (ids || []).map((id, i) => {
    const m = STICKER_CATALOG[id];
    return `<div class="sticker-badge pop" style="animation-delay:${320 + i * 220}ms">
      <img src="${m.img}" alt=""><span class="sticker-badge-name">${esc(m.kk)}</span>
    </div>`;
  }).join("");
  box.hidden = !ids || ids.length === 0;
  if (ids && ids.length) log(`жапсырма: ${ids.join(", ")}`);
}

// Shared by the operator's "Сначала" killswitch and the child's "Тағы
// ойнаймыз" on the end screen — both fully reset state and jump back to
// the intro (startStateForMemory picks intro vs intro_again by replay count).
function startSession() {
  Session.start(Date.now(), {
    activity: ACTIVITY.id, skills: ACTIVITY.skills,
    profileId: CHILD ? CHILD.id : null, keepTranscripts: !!CHILD_SETTINGS.keepTranscripts,
  });
}

function restartStory() {
  storyEnded = false;
  try { heroVoice.pause(); heroVoice.currentTime = 0; } catch { /* nothing loaded */ }
  stopEchoPlayback();
  activeQuestionId = null;
  currentRoute = null;
  endScreen.classList.remove("show");
  startSession();
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  } catch (err) {
    const hint = {
      NotFoundError: "микрофон не найден — подключи гарнитуру или проверь настройки звука устройства",
      NotAllowedError: "доступ к микрофону запрещён — 🔒/ⓘ у адреса сайта → Микрофон → Разрешить, затем обнови страницу",
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

  // The question this clip actually answers, captured BEFORE the network
  // round-trip. currentId is read fresh everywhere below, but only at the
  // moment the async work finishes — if the operator advanced (or VAD armed
  // the next question) while a slow /api/transcribe was in flight, the late
  // response would paint its transcript and start the auto-advance countdown
  // against whatever question is on screen NOW, not the one that was
  // answered. meta.nodeId wins for a VAD clip for the same reason it wins in
  // the form below: it is the node that was up when the child started talking.
  const askedId = meta.nodeId ?? currentId;

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
  // The server needs the rolled count to know which number is the right
  // answer at q_tracks — it is what expectedForms() scores the two
  // recognitions against.
  form.append("trackCount", String(countForNode(meta.nodeId || currentId)));
  setStage("stt", "running", "");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (currentId !== askedId) {
      log(`transcribe: ответ на "${askedId}" пришёл поздно, сейчас "${currentId}" — игнорирую`);
      thinkingDots.hidden = true;
      recordBtn.disabled = false;
      fileInput.disabled = false;
      return;
    }

    sttFailStreak = 0;
    statusText.textContent = "";
    thinkingDots.hidden = true;
    lastAlternatives = data.alternatives || [];
    lastLowConfidence = !!data.lowConfidence;
    // The route the picker read out of the audio (null when the two
    // recognitions disagreed — then the story re-asks instead of guessing).
    lastRoute = data.route ?? null;
    transcriptEl.textContent = data.transcript || "(тишина / не распознано)";
    const langBit = data.lang ? ` · ${data.lang} conf ${Number(data.confidence ?? 0).toFixed(2)}` : "";
    metaEl.textContent =
      `${data.ms} ms · ${data.engine === "groq" ? "Groq" : "локальный Whisper (fallback)"}${langBit}`;
    setStage("stt", "ok", `${data.ms}ms ${data.engine === "groq" ? "groq" : "local"}`);

    if (data.blocked) {
      setStage("safety", "err", "BLOCKED");
      blockedFlash.classList.add("show", "materialize-in");
      storyEnded = true;
      Session.markBlocked();
      Session.finish({ completed: false });
      // The question this clip answered may still be armed, with the
      // total-silence timer pending — disarm both so nothing can fire into a
      // terminal session (markReask() guards on storyEnded too, belt and braces).
      disarmVad();
      recordBtn.style.display = "none";
      uploadRow.style.display = "none";
      log(`BLOCKED (автоматически, без оператора): "${data.transcript}" — сценарий остановлен`);
    } else {
      setStage("safety", "ok", "");
      resultEl.classList.add("show", "materialize-in");
      const alts = lastAlternatives.map((a) => `${a.lang}="${a.text}"`).join(" ");
      log(`transcript: "${data.transcript}" (${data.ms}ms) [${alts}]`);
      const node = NODES[currentId];
      if (lastLowConfidence && !data.transcript && node?.kind === "question" && node.criterion) {
        // Nothing trustworthy came back (silence, a hallucinated subtitle
        // credit, or two recognitions that both scored zero). Sending that to
        // the LLM just buys a confident wrong verdict — the story re-asks
        // gently instead, which is also the right response to a child who is
        // too quiet or too far from the mic.
        setStage("classify", "skip", "низкая уверенность STT");
        showVerdictAndAutoAdvance(
          { label: "unclear", reason: "тихо/непонятно (STT)" },
          "🎧 STT",
        );
      } else {
        classifyAndSuggest(data.transcript);
      }
    }
  } catch (err) {
    if (currentId !== askedId) {
      log(`transcribe: ошибка для "${askedId}" пришла поздно, сейчас "${currentId}" — игнорирую`);
      thinkingDots.hidden = true;
      recordBtn.disabled = false;
      fileInput.disabled = false;
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
    lastTranscript = "";
    resultEl.classList.add("show", "materialize-in");
    setStage("stt", "err", err.message);
    log(`STT недоступен, ручной режим: ${err.message}`);
    // The child is not left waiting for a button only the operator panel
    // has: the adult judges this answer, and after a second failure in a row
    // every next question too (adultJudgeReason).
    sttFailStreak++;
    if (navigator.onLine !== false) noteError(`stt: ${err.message}`, "/api/transcribe");
    showJudgeBar(sttFailStreak >= STT_FAILS_FOR_ADULT ? "stt" : (navigator.onLine === false ? "offline" : "stt"));
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
const AI_AUTO_ADVANCE_MS = 1000;

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
let pendingChoice = null; // picture card id from the last verdict or tap ("pick" questions)
let lastTranscript = "";
// Both Whisper passes of the last clip, and whether the pick was trustworthy —
// forwarded to /api/classify so the LLM can judge the kk and ru recognitions
// together instead of only the one that scored highest.
let lastAlternatives = [];
let lastLowConfidence = false;
// Route decided by lib/stt-pick.js on the server (fork questions). Null means
// "no clear single route" — including the kk/ru disagreement case.
let lastRoute = null;

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
  const s = NODES[currentId];
  if (s.kind !== "question") return;
  log(`${source}: ВЕРНО`);
  // Child-facing "yes!" — a two-note ding now, sparkles AFTER the advance:
  // renderState replaces #heroStage's contents, which would wipe the sparkle
  // nodes the same tick they were appended (same trap as heroShake below).
  // Never awaited, so the story moves at exactly the same speed whether or
  // not any of it works.
  playDing();
  recordAnswer("correct", source);
  if (s.mode === "branch") {
    const route = pendingRoute || currentRoute || "river";
    currentRoute = route;
    Session.setRoute(route);
    Session.moment(`жолды таңдады: ${route === "river" ? "өзен" : "орман"}`);
    advanceFromQuestion(s.onAnswer[route]);
    burstSparkles();
    return;
  }
  if (s.mode === "pick") {
    // The right card named/tapped — or the operator's ✅ with no card known,
    // which takes the first (only) right answer.
    const rightIds = Object.keys(s.onAnswer || {});
    const choice = rightIds.includes(pendingChoice) ? pendingChoice : rightIds[0];
    glowLetter();
    advanceFromQuestion(s.onAnswer[choice]);
    burstSparkles();
    return;
  }
  if (ACTIVITY.kind === "lesson") glowLetter();
  advanceFromQuestion(s.onCorrect);
  burstSparkles();
}

// "pick" questions only: the child named/tapped a card that is NOT the
// answer but is a real, on-topic choice (the ball at «where is А?»). The
// hero corrects gently and asks again — it does not spend a re-ask and does
// not shake, because the child did answer. Recorded as its own verdict so
// the report can tell "picked the other one first" from "said nothing".
function markOther(choice, source) {
  if (storyEnded) return;
  cancelAiAutoAdvance();
  const s = NODES[currentId];
  if (s.kind !== "question" || s.mode !== "pick") return;
  const next = s.onOther && s.onOther[choice];
  if (!next) { markReask(source); return; }
  log(`${source}: ДРУГОЕ (${choice}) → мягкая поправка`);
  pendingChoice = choice;
  recordAnswer("other", source);
  advanceFromQuestion(next);
}

// Tap on a picture card (pictureOverlay, "pick" nodes). A full answer in
// its own right: it disarms the mic for this turn and goes straight to the
// verdict with no countdown — the child already committed with a finger.
function onPictureTap(choiceId) {
  if (storyEnded || !currentId) return;
  const s = NODES[currentId];
  if (!s || s.kind !== "question" || s.mode !== "pick" || !choiceId) return;
  const card = pictureOverlay.querySelector(`[data-choice="${choiceId}"]`);
  if (card) card.classList.add("picked");
  pictureOverlay.querySelectorAll("button.pic-card").forEach((b) => { b.disabled = true; });
  cancelAiAutoAdvance();
  disarmVad();
  const choice = (s.choices || []).find((c) => c.id === choiceId);
  lastTranscript = `👆 ${choice ? choice.kk : choiceId}`;
  if (!recordingStartedAt) recordingStartedAt = Date.now();
  pendingChoice = choiceId;
  log(`сурет: ребёнок нажал «${lastTranscript}»`);
  // Session source "tap" is what summarize() counts as a gesture answer.
  if (s.onAnswer && s.onAnswer[choiceId]) markCorrect("tap");
  else if (s.onOther && s.onOther[choiceId]) markOther(choiceId, "tap");
  else markReask("tap");
}
pictureOverlay?.addEventListener("click", (e) => {
  const btn = e.target.closest("button.pic-card");
  if (btn && !btn.disabled) onPictureTap(btn.dataset.choice);
});

function markReask(source) {
  // A blocked session is terminal: Session.finish() has already run and the
  // controls are hidden. The total-silence timer (VAD_SILENCE_TIMEOUT_MS) can
  // still fire after a block, and without this guard it would walk the story
  // forward and finish the session a SECOND time. Same guard every other
  // advance handler carries.
  if (storyEnded) return;
  cancelAiAutoAdvance();
  const s = NODES[currentId];
  if (s.kind !== "question") return;
  if (reaskCount < maxReasks()) {
    reaskCount++;
    log(`${source}: ПЕРЕСПРОСИТЬ (${reaskCount}-я попытка из ${maxReasks()})`);
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
  // Server-side picker first (it saw both recognitions and the expected
  // forms), then the STT route from this clip, and only then the LLM's prose.
  if (data.route === "river" || data.route === "forest") return data.route;
  if (lastRoute === "river" || lastRoute === "forest") return lastRoute;
  const r = String(data.reason || "").toLowerCase();
  if (r.includes("river")) return "river";
  if (r.includes("forest")) return "forest";
  return null;
}

// "pick" questions: which card the verdict names. Same precedence as
// routeFromVerdict — the server-side picker's route tag (lib/stt-pick.js
// scores q_a_pick as a route-tagged choice), the local classifier's `choice`,
// then the LLM's prose, which the criterion asks to carry the card id.
function choiceFromVerdict(data, s) {
  const ids = [...Object.keys(s.onAnswer || {}), ...Object.keys(s.onOther || {})];
  for (const cand of [data.choice, data.route, lastRoute]) {
    if (ids.includes(cand)) return cand;
  }
  const r = String(data.reason || "").toLowerCase();
  return ids.find((id) => r.includes(id)) || null;
}

function showVerdictAndAutoAdvance(data, source) {
  const s = NODES[currentId];
  pendingRoute = s.mode === "branch" ? routeFromVerdict(data) : null;
  if (s.mode === "branch" && data.label === "correct" && !pendingRoute) {
    data = { ...data, label: "unclear", reason: `${data.reason || ""} (маршрут не распознан)` };
  }
  pendingChoice = s.mode === "pick" ? choiceFromVerdict(data, s) : null;
  if (s.mode === "pick" && data.label === "correct") {
    if (!pendingChoice) data = { ...data, label: "unclear", reason: `${data.reason || ""} (картинка не распознана)` };
    else if (s.onOther && s.onOther[pendingChoice]) data = { ...data, label: "other" };
  }
  const labelText = {
    correct: "✅ ВЕРНО", incorrect: "❌ НЕВЕРНО", other: "↩ ДРУГАЯ КАРТИНКА / ПОПРАВИТЬ", unclear: "🔁 НЕ ПОНЯЛ / ПЕРЕСПРОСИТЬ",
  }[data.label];
  const tag = pendingRoute || pendingChoice;
  aiVerdictEl.className = `ai-verdict show ${data.label}`;
  aiVerdictEl.innerHTML = `
    <span class="label">${source}: ${labelText}${tag ? ` → ${tag}` : ""}</span>
    <span class="reason">${esc(data.reason || "")}${data.ms ? ` (${data.ms}ms)` : ""}</span>
    <span class="countdown">Авто-переход через ${(AI_AUTO_ADVANCE_MS / 1000).toFixed(1)}с — нажми кнопку, чтобы отменить</span>
  `;
  log(`${source}: ${data.label} — "${data.reason}"${data.ms ? ` (${data.ms}ms)` : ""}`);

  cancelAiAutoAdvance();
  aiAutoAdvanceTimer = setTimeout(() => {
    aiAutoAdvanceTimer = null;
    if (data.label === "correct") markCorrect(`${source} (авто)`);
    else if (data.label === "other") markOther(pendingChoice, `${source} (авто)`);
    else markReask(`${source} (авто)`);
  }, AI_AUTO_ADVANCE_MS);
}

function classifyCtx() {
  return { trackCount: countForNode(currentId), brotherName: brotherName.kkLower, numKk: NUM_KK, numRu: NUM_RU };
}

// Client-side twin of lib/stt-pick.js's expectedForms().forms — the same
// idea, built from the tables classify-local.js already loads, so the
// classifier is told what a right answer looks like here without the page
// having to import an ESM module.
function expectedFormsForNode(nodeId) {
  if (nodeId === "q_tracks") return NUM_FORMS[trackCount] || [];
  if (NODES[nodeId]?.count) return NUM_FORMS[NODES[nodeId].count]; // lesson counts: q_count5, q_plus, q_minus
  if (nodeId === "q_letter_a") return STORY.q_letter_a.forms;
  if (nodeId === "q_fork") return [...ROUTE_KEYWORDS.river, ...ROUTE_KEYWORDS.forest];
  // Lesson nodes carry their own accepted forms (story.js `accept` /
  // `choices[].forms`), so no second table is needed here.
  const node = NODES[nodeId];
  if (node?.mode === "pick") return (node.choices || []).flatMap((c) => c.forms || []);
  if (Array.isArray(node?.accept)) return [...node.accept];
  return [];
}

async function classifyAndSuggest(transcript) {
  // Captured up front for the same reason as in submitAudio(): a slow
  // /api/classify response must not paint a verdict, or start an
  // auto-advance countdown, for a question that is no longer on screen.
  const askedId = currentId;
  const s = NODES[askedId];
  if (!s || s.kind !== "question" || !s.criterion) return;
  lastTranscript = transcript;
  aiVerdictEl.className = "ai-verdict show";
  aiVerdictEl.innerHTML = `<span class="label">🤖 ИИ думает…</span>`;
  setStage("classify", "running", "");

  let data;
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        questionKk: s.kk,
        criterion: s.criterion,
        // Tagged, not positional: the server labels the prompt lines by
        // language, and a dropped/failed pass must not shift ru into kk.
        alternatives: lastAlternatives.map((a) => ({ lang: a.lang ?? null, text: a.text ?? "" })),
        expectedForms: expectedFormsForNode(askedId),
      }),
    });
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  } catch (err) {
    if (currentId !== askedId) return; // question changed while this was in flight
    // The system still confirms itself here — it just switches from the
    // network LLM to a local, deterministic answer check instead of
    // parking on the operator's buttons until someone clicks.
    setStage("classify", "skip", "локальный фолбэк, без сети");
    log(`ИИ-классификатор недоступен, локальный фолбэк: ${err.message}`);
    showVerdictAndAutoAdvance(localClassify(s, transcript, classifyCtx()), "🧮 Локально");
    return;
  }

  if (currentId !== askedId) return; // same guard for the success path
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
  const s = NODES[currentId];
  if (s.kind !== "question") return;
  log("оператор: ADVANCE (форс, STT-килл-свитч) → как «верно»");
  if (s.mode === "branch") { pendingRoute = pendingRoute || "river"; markCorrect("оператор-advance"); return; }
  if (s.mode === "pick") { pendingChoice = Object.keys(s.onAnswer || {})[0] || null; markCorrect("оператор-advance"); return; }
  recordAnswer("correct", "оператор-advance");
  advanceFromQuestion(s.onCorrect);
});

// boot — the very first speakLine() call must happen inside a real user
// gesture (a tap), or iOS Safari silently blocks audio playback (no
// permission dialog, just a rejected play() promise). Every other
// renderState() call in the app already runs inside a click handler;
// this "Бастау" gate makes the first one no exception.
function startStateForMemory() {
  // The fox tale keeps its original counter; every other activity (lessons,
  // the tales of TALES) has its own under memory().lessons[id].
  const played = ACTIVITY.id !== "story" ? Session.lessonRuns(ACTIVITY.id) : Session.memory().runs;
  return played > 0 ? ACTIVITY.startAgain : ACTIVITY.start;
}

// Start overlay, end screen and tab title follow the activity, so the one
// page serves the tale and every lesson without a copy of story.html each.
document.getElementById("startCover").src = ACTIVITY.cover;
document.getElementById("startTitle").textContent = ACTIVITY.title;
document.getElementById("startSubKk").textContent = ACTIVITY.subtitleKk;
document.getElementById("startSubRu").textContent = ACTIVITY.subtitleRu;
document.getElementById("endLine").textContent = ACTIVITY.endLineKk;
if (ACTIVITY.kind === "lesson" || ACTIVITY.kind === "tale") {
  document.title = `Ертегім — ${ACTIVITY.title}`;
  // A lesson starts in daylight, not at dusk; a tale says which it needs.
  if (ACTIVITY.kind === "lesson" || ACTIVITY.startSky === "day") document.getElementById("startSky")?.classList.add("sky-day");
}
if (ACTIVITY.id !== "story") log(`активность из URL: ${ACTIVITY.id} (${ACTIVITY.kind})`);

// Gentle-mode switch in the operator panel: persisted on this device. A
// lesson forces the mode on, so its box reads checked and locked.
const gentleToggle = document.getElementById("gentleToggle");
if (gentleToggle) {
  gentleToggle.checked = gentleMode();
  gentleToggle.disabled = ACTIVITY.gentle || gentleParam;
  gentleToggle.addEventListener("change", () => {
    gentleOperator = gentleToggle.checked;
    try { localStorage.setItem(GENTLE_KEY, gentleOperator ? "1" : "0"); } catch { /* private mode */ }
    applyGentleClass();
    log(`мягкий режим: ${gentleMode() ? "вкл" : "выкл"} (тишина ${vadSilenceMs()}мс, ожидание ${vadSilenceTimeoutMs()}мс, переспросов ${maxReasks()})`);
  });
}
applyGentleClass();
if (gentleMode()) log(`мягкий режим активен: тишина ${vadSilenceMs()}мс, ожидание ${vadSilenceTimeoutMs()}мс, переспросов ${maxReasks()}, без эффектов`);
if (CHILD) {
  const childEl = document.getElementById("opChild");
  if (childEl) childEl.textContent = `${CHILD.name}${CHILD_SETTINGS.keepTranscripts ? " · транскрипты сохраняются" : ""}`;
  log(`профиль: ${CHILD.name} (${CHILD.id})`);
}

// Operator panel: hidden from the child, toggled by the ` key, the ⚙ button
// or ?op=1 / ?operator=1 for a stage laptop. Both spellings are accepted
// because the pitch-week build used ?operator=1 and that is what ends up in
// the bookmarks and notes people actually type on the day.
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
const opParams = new URLSearchParams(location.search);
if (opParams.get("op") === "1" || opParams.get("operator") === "1") setOperatorPanel(true);

// ?route=river|forest lets the library cards (index.html) pin which fork the fox takes
// at q_fork when the child's answer doesn't make it clear — anything else
// (missing, "op", typos) falls back to the existing 50/50 coin flip.
const routeParam = new URLSearchParams(location.search).get("route");
const preferredRoute = routeParam === "river" || routeParam === "forest" ? routeParam : null;
if (preferredRoute) log(`маршрут по умолчанию из URL: ${preferredRoute}`);

Object.keys(pipelineStageEls).forEach((id) => setStage(id, "idle", ""));

const startOverlay = document.getElementById("startOverlay");
document.getElementById("startBtn").addEventListener("click", () => {
  startOverlay.style.display = "none";
  document.body.classList.remove("pre-start"); // the panel no longer needs to hold the start scene
  // Ask for the mic up front, inside this same tap, so the permission
  // prompt (and its latency) is out of the way before the first question
  // ever arrives — not fatal if it fails, armVadForQuestion() re-attempts
  // ensureMicStream() per-question and falls back to the manual button.
  ensureMicStream().catch((err) => log(`mic prefetch failed: ${err.name || err.message}`));
  // The happy pose is the one fox pose with no video clip, and it is first
  // needed at `found` — the emotional peak. Cold, that 1.3MB PNG lands a
  // second or two after the scene does and the hero (plus the little
  // brother, same file) pops in late. Warm it here, in the same tap.
  new Image().src = FOX_POSE_IMAGE.happy;
  startSession();
  renderState(startStateForMemory());
});
