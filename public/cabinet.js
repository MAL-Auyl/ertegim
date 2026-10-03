// Therapist's / parent's cabinet (cabinet.html): several children on one
// device, per-child settings, the session history with attempt transcripts,
// two trend lines, print-to-PDF and a JSON export. Everything is read from
// the same localStorage the game writes (profiles.js, session.js,
// stickers.js) — nothing leaves the device.
//
// Pure helpers (series, formatting, labels) are at the top and exported for
// tests/cabinet.test.js; the DOM wiring below only runs in the page.

const ACTIVITY_TITLES = {
  story: "Сказка: лисёнок ищет братика",
  "letter-a": "Урок: буква А (особый режим)",
  letters: "Урок: буквы — А",
  count: "Урок: счёт до 5",
  plus: "Урок: сложение 2 + 1",
  minus: "Урок: вычитание 4 − 1",
  write: "Урок: письмо — А",
};
const VERDICT_LABEL = { correct: "верно", unclear: "не понял", other: "другая картинка", reveal: "показал герой" };
const SKILL_LABEL = {
  count: "счёт", choice: "выбор пути", empathy: "ободрение", rhyme: "рифма",
  sound_a: "звук А", word_a: "слово «алма»", pick_a: "выбор картинки", open_a: "про маму",
  letter: "буква", plus: "сложение", minus: "вычитание", write: "письмо",
};

function activityTitle(id) {
  return ACTIVITY_TITLES[id] || id || "—";
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} мин ${s} с` : `${s} с`;
}

// One point per session, oldest first: first-try share (0..1) and average
// response in seconds. Sessions without questions carry null and are
// skipped by the line but kept in the table.
function seriesFromHistory(history) {
  return [...history].reverse().map((s) => ({
    date: s.date,
    activity: s.activity || "story",
    firstTry: s.questionsTotal ? s.firstTryCorrect / s.questionsTotal : null,
    avgSec: s.avgResponseSec == null ? null : Math.round(s.avgResponseSec * 10) / 10,
    completed: !!s.completed,
    blocked: !!s.blocked,
  }));
}

// Mean of the last `n` numeric values vs the `n` before them — the cabinet's
// "улучшение / без изменений / хуже" line. null when there is too little.
function trend(values, n = 3) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const recent = v.slice(-n);
  const before = v.slice(-2 * n, -n);
  if (!before.length) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return mean(recent) - mean(before);
}

// Minimal single-series line: 2 px line, 8 px markers, one direct label on
// the latest point, hover tooltips through <title>. `fmt` renders a value.
function lineSVG(points, { width = 320, height = 120, min = 0, max = 1, fmt = (v) => String(v), color = "var(--accent)" } = {}) {
  const pad = { l: 8, r: 44, t: 14, b: 14 };
  const xs = points.map((p, i) => pad.l + (points.length === 1 ? (width - pad.l - pad.r) / 2 : (i * (width - pad.l - pad.r)) / (points.length - 1)));
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const live = points.map((p, i) => (p.v == null ? null : { x: xs[i], y: y(p.v), v: p.v, label: p.label })).filter(Boolean);
  if (!live.length) return `<svg viewBox="0 0 ${width} ${height}" class="trend"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="trend-empty">нет данных</text></svg>`;
  const path = live.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = live[live.length - 1];
  const dots = live.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--card-solid)" stroke-width="2"><title>${esc(p.label)}: ${esc(fmt(p.v))}</title></circle>`).join("");
  const grid = [0, 0.5, 1].map((t) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(min + t * (max - min)).toFixed(1)}" y2="${y(min + t * (max - min)).toFixed(1)}" class="trend-grid"/>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="trend" role="img">
    ${grid}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${(last.x + 8).toFixed(1)}" y="${(last.y + 4).toFixed(1)}" class="trend-label">${esc(fmt(last.v))}</text>
  </svg>`;
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function exportBundle(profile, history, stickers) {
  return {
    exportedAt: new Date().toISOString(),
    app: "Ертегім",
    child: { id: profile.id, name: profile.name, age: profile.age, notes: profile.notes, settings: profile.settings, createdAt: profile.createdAt },
    sessions: history,
    stickers,
  };
}

if (typeof module !== "undefined") {
  module.exports = { activityTitle, fmtDateTime, fmtDuration, seriesFromHistory, trend, lineSVG, exportBundle, esc, ACTIVITY_TITLES, SKILL_LABEL, VERDICT_LABEL };
}

// ---------------------------------------------------------------- DOM ----
if (typeof document !== "undefined" && document.getElementById("cabinet")) {
  const $ = (id) => document.getElementById(id);
  const ACTIVITY_IDS = Object.keys(ACTIVITY_TITLES);

  // PIN: cosmetic gate, same as the parent report — this is "not for the
  // child", not security. Any 4 digits open it.
  $("pinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("pinInput").value.trim().length < 1) return;
    $("pinGate").hidden = true;
    $("cabinet").hidden = false;
    render();
  });

  function render() {
    renderTabs();
    renderChild();
  }

  function renderTabs() {
    const list = Profiles.list();
    const active = Profiles.active().id;
    $("childTabs").innerHTML = list.map((p) =>
      `<button type="button" class="child-tab${p.id === active ? " active" : ""}" data-id="${esc(p.id)}">👧 ${esc(p.name)}</button>`).join("")
      + `<button type="button" class="child-tab add" id="addChild">＋ Добавить ребёнка</button>`;
    $("childTabs").querySelectorAll(".child-tab[data-id]").forEach((b) => b.addEventListener("click", () => { Profiles.setActive(b.dataset.id); render(); }));
    $("addChild").addEventListener("click", () => {
      const name = prompt("Имя ребёнка:");
      if (name === null) return;
      Profiles.add({ name });
      render();
    });
  }

  function renderChild() {
    const p = Profiles.active();
    const s = p.settings;
    $("fName").value = p.name;
    $("fAge").value = p.age ?? "";
    $("fNotes").value = p.notes || "";
    $("fGentle").value = s.gentle === true ? "on" : s.gentle === false ? "off" : "auto";
    $("fReasks").value = s.maxReasks ?? "";
    $("fSilence").value = s.silenceMs ?? "";
    $("fTimeout").value = s.silenceTimeoutMs ?? "";
    $("fTranscripts").checked = !!s.keepTranscripts;
    $("assignedList").innerHTML = ACTIVITY_IDS.map((id) =>
      `<label class="assign"><input type="checkbox" value="${id}" ${s.assigned.includes(id) ? "checked" : ""}> ${esc(activityTitle(id))}</label>`).join("");
    $("deleteChild").disabled = Profiles.list().length <= 1;

    const history = Session.history();
    renderStats(history);
    renderTrends(history);
    renderSessions(history);
    renderStickers();
    $("printTitle").textContent = `${p.name} — Ертегім, отчёт от ${new Date().toLocaleDateString("ru-RU")}`;
  }

  function renderStats(history) {
    const done = history.filter((h) => h.completed).length;
    const series = seriesFromHistory(history);
    const ft = series.map((x) => x.firstTry).filter((x) => x != null);
    const avg = series.map((x) => x.avgSec).filter((x) => x != null);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    $("stSessions").textContent = String(history.length);
    $("stSessionsLabel").textContent = history.length ? `занятий · ${done} до конца` : "занятий";
    $("stFirst").textContent = ft.length ? `${Math.round(mean(ft) * 100)} %` : "—";
    $("stAvg").textContent = avg.length ? `${mean(avg).toFixed(1)} с` : "—";
    const words = new Set(); history.forEach((h) => (h.words || []).forEach((w) => words.add(w)));
    $("stWords").textContent = String(words.size);
    const tf = trend(ft), ta = trend(avg);
    const parts = [];
    if (tf != null) parts.push(tf > 0.05 ? "ответы с первого раза — лучше" : tf < -0.05 ? "ответы с первого раза — хуже" : "ответы с первого раза — без изменений");
    if (ta != null) parts.push(ta < -0.3 ? "отвечает быстрее" : ta > 0.3 ? "отвечает медленнее" : "скорость ответа — без изменений");
    $("stTrend").textContent = parts.length ? parts.join(" · ") : "Для динамики нужно хотя бы 4 сессии.";
  }

  function renderTrends(history) {
    const series = seriesFromHistory(history);
    const label = (x) => `${fmtDateTime(x.date)} · ${activityTitle(x.activity)}`;
    $("trendFirst").innerHTML = lineSVG(series.map((x) => ({ v: x.firstTry, label: label(x) })), { min: 0, max: 1, fmt: (v) => `${Math.round(v * 100)} %`, color: "var(--ok)" });
    const maxSec = Math.max(5, ...series.map((x) => x.avgSec || 0));
    $("trendAvg").innerHTML = lineSVG(series.map((x) => ({ v: x.avgSec, label: label(x) })), { min: 0, max: Math.ceil(maxSec), fmt: (v) => `${v.toFixed(1)} с`, color: "var(--info)" });
  }

  function renderSessions(history) {
    if (!history.length) { $("sessions").innerHTML = `<p class="muted">Сессий пока нет. Сыграйте сказку или урок с этим ребёнком.</p>`; return; }
    $("sessions").innerHTML = history.map((h, i) => {
      const skills = Object.entries(h.skills || {}).filter(([, st]) => st !== "skipped")
        .map(([k, st]) => `<span class="tag tag-${st}">${esc(SKILL_LABEL[k] || k)}: ${st === "first" ? "сразу" : st === "reask" ? "с переспросом" : "показал герой"}</span>`).join(" ");
      const attempts = (h.attempts || []).map((a) =>
        `<tr><td>${esc(SKILL_LABEL[a.skill] || a.skill)}</td><td>${a.attempt}</td><td class="tr">${esc(a.transcript || "(тишина)")}</td><td><span class="tag tag-${a.verdict}">${esc(VERDICT_LABEL[a.verdict] || a.verdict)}</span></td><td>${a.source === "tap" ? "👆 жест" : a.source === "trace" ? "✏️ палец" : esc(a.source || "")}</td><td>${a.responseSec == null ? "—" : a.responseSec + " с"}</td></tr>`).join("");
      return `<details class="session"${i === 0 ? " open" : ""}>
        <summary>
          <span class="s-date">${esc(fmtDateTime(h.date))}</span>
          <span class="s-act">${esc(activityTitle(h.activity))}</span>
          <span class="s-stat">🎯 ${h.firstTryCorrect}/${h.questionsTotal}</span>
          <span class="s-stat">⚡ ${h.avgResponseSec == null ? "—" : h.avgResponseSec.toFixed(1) + " с"}</span>
          <span class="s-stat">⏱ ${esc(fmtDuration(h.durationSec))}</span>
          ${h.blocked ? '<span class="tag tag-reveal">⛔ прервана</span>' : h.completed ? "" : '<span class="tag tag-unclear">не завершена</span>'}
        </summary>
        <div class="s-body">
          <div class="s-skills">${skills || "<span class='muted'>вопросов не было</span>"}</div>
          ${h.gestureAnswers ? `<p class="muted">👆 ответов жестом: ${h.gestureAnswers}</p>` : ""}
          ${h.words && h.words.length ? `<p><b>Слова:</b> ${h.words.map(esc).join(", ")}</p>` : ""}
          ${h.moments && h.moments.length ? `<p><b>Моменты:</b> ${h.moments.map((m) => esc(m.text_kk)).join("; ")}</p>` : ""}
          ${attempts
            ? `<div class="table-wrap"><table class="attempts"><thead><tr><th>Навык</th><th>#</th><th>Что сказал (транскрипт)</th><th>Вердикт</th><th>Канал</th><th>Реакция</th></tr></thead><tbody>${attempts}</tbody></table></div>`
            : `<p class="muted">Транскрипты попыток не сохранялись (включите «Сохранять транскрипты» в настройках ребёнка).</p>`}
        </div>
      </details>`;
    }).join("");
  }

  function renderStickers() {
    const shelf = Stickers.shelf();
    $("stickers").innerHTML = shelf.map((s) => `<span class="tag ${s.earnedAt ? "tag-first" : "tag-off"}">${esc(s.kk)}</span>`).join(" ");
  }

  $("childForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = Profiles.active();
    const g = $("fGentle").value;
    Profiles.update(p.id, {
      name: $("fName").value,
      age: $("fAge").value === "" ? null : Number($("fAge").value),
      notes: $("fNotes").value,
      settings: {
        gentle: g === "on" ? true : g === "off" ? false : null,
        maxReasks: $("fReasks").value === "" ? null : Number($("fReasks").value),
        silenceMs: $("fSilence").value === "" ? null : Number($("fSilence").value),
        silenceTimeoutMs: $("fTimeout").value === "" ? null : Number($("fTimeout").value),
        keepTranscripts: $("fTranscripts").checked,
        assigned: [...$("assignedList").querySelectorAll("input:checked")].map((i) => i.value),
      },
    });
    $("saved").hidden = false;
    setTimeout(() => { $("saved").hidden = true; }, 1800);
    render();
  });

  $("deleteChild").addEventListener("click", () => {
    const p = Profiles.active();
    if (!confirm(`Удалить профиль «${p.name}» и всю его историю на этом устройстве?`)) return;
    Profiles.remove(p.id);
    render();
  });

  $("exportJson").addEventListener("click", () => {
    const p = Profiles.active();
    const data = exportBundle(p, Session.history(), Stickers.earned());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ertegim-${p.name.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("printBtn").addEventListener("click", () => {
    document.querySelectorAll("details.session").forEach((d) => { d.open = true; });
    window.print();
  });
}
