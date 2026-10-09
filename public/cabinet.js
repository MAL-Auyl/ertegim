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
  "letter-o": "Урок: буква О (особый режим)",
  "letter-u": "Урок: буква Ұ — звук «у» (особый режим)",
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
  sound_o: "звук О", word_o: "слово «от»", pick_o: "выбор картинки (О)", open_o: "про игрушку",
  sound_u: "звук Ұ (у)", word_u: "слово «ұшақ»", pick_u: "выбор картинки (Ұ)", open_u: "что нравится",
  letter: "буква", plus: "сложение", minus: "вычитание", write: "письмо",
};

// Tales (story.js TALES) add their own titles and skill labels.
(function addTaleLabels() {
  const tales = typeof TALES !== "undefined" ? TALES : (typeof require === "function" ? require("./story.js").TALES : {});
  for (const [id, t] of Object.entries(tales || {})) {
    ACTIVITY_TITLES[id] = `Сказка: ${t.titleRu || t.title}`;
    for (const [k, v] of Object.entries(t.skills || {})) SKILL_LABEL[k] = v.ru;
  }
})();

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

// One row of the «Все дети» overview. `history` is newest first (as
// Session stores it); `weekProgress` is homework.js weekProgress() output or
// [] when the child has no plan. Flags are what a therapist should look at
// first: nobody played for a week, homework far behind late in the week,
// first-try answers going down.
const STALE_DAYS = 7;
function childOverview(profile, history, weekProgress = [], now = Date.now()) {
  const h = Array.isArray(history) ? history : [];
  const last = h[0] ? new Date(h[0].date).getTime() : null;
  const daysSince = last == null || Number.isNaN(last) ? null : Math.max(0, Math.floor((now - last) / 86400000));
  const weekAgo = now - 7 * 86400000;
  const week = h.filter((s) => new Date(s.date).getTime() >= weekAgo).length;
  const series = seriesFromHistory(h).map((x) => x.firstTry).filter((x) => x != null);
  const recent = series.slice(-3);
  const firstTry = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
  const t = trend(series);
  const hwDone = weekProgress.reduce((a, p) => a + Math.min(p.done, p.target), 0);
  const hwTarget = weekProgress.reduce((a, p) => a + p.target, 0);
  const dow = (new Date(now).getDay() + 6) % 7; // Mon = 0
  const flags = [];
  if (daysSince === null) flags.push("ещё не занимался");
  else if (daysSince >= STALE_DAYS) flags.push(`не занимался ${daysSince} дн.`);
  if (hwTarget && dow >= 3 && hwDone / hwTarget < 0.5) flags.push("задание отстаёт");
  if (t != null && t < -0.15) flags.push("ответов с первого раза меньше");
  return {
    id: profile.id, name: profile.name, age: profile.age ?? null,
    sessions: h.length, week, daysSince,
    firstTry, trend: t == null ? null : t > 0.05 ? "up" : t < -0.05 ? "down" : "flat",
    homework: hwTarget ? { done: hwDone, target: hwTarget } : null,
    flags,
  };
}

// Children needing attention first, then by name.
function sortOverview(rows) {
  return [...rows].sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || a.name.localeCompare(b.name, "ru"));
}

function exportBundle(profile, history, stickers) {
  return {
    exportedAt: new Date().toISOString(),
    app: "Ертегім",
    child: { id: profile.id, linkedId: profile.linkedId || null, name: profile.name, age: profile.age, notes: profile.notes, settings: profile.settings, createdAt: profile.createdAt },
    sessions: history,
    stickers,
  };
}

if (typeof module !== "undefined") {
  module.exports = { activityTitle, fmtDateTime, fmtDuration, seriesFromHistory, trend, lineSVG, exportBundle, esc, childOverview, sortOverview, ACTIVITY_TITLES, SKILL_LABEL, VERDICT_LABEL };
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
    renderOverview();
    renderTabs();
    renderChild();
    renderDevice();
  }

  function renderOverview() {
    const list = Profiles.list();
    $("overviewSection").hidden = list.length < 2;
    if (list.length < 2) return;
    const active = Profiles.active().id;
    const rows = sortOverview(list.map((p) => {
      const history = Session.historyFor(p.id);
      const plan = p.homework ? Homework.normalizePlan(p.homework, ACTIVITY_IDS) : null;
      return childOverview(p, history, plan ? Homework.weekProgress(plan, history) : []);
    }));
    const when = (d) => (d === null ? "—" : d === 0 ? "сегодня" : d === 1 ? "вчера" : `${d} дн. назад`);
    const arrow = { up: "▲", down: "▼", flat: "■" };
    $("overviewRows").innerHTML = rows.map((r) => `<tr class="${r.id === active ? "active" : ""}">
      <td><button type="button" class="ov-name" data-id="${esc(r.id)}">${esc(r.name)}</button>${r.age ? ` <span class="muted">${r.age} л.</span>` : ""}</td>
      <td>${when(r.daysSince)}</td>
      <td class="num">${r.week}</td>
      <td class="num">${r.homework ? `${r.homework.done}/${r.homework.target}` : "—"}</td>
      <td class="num">${r.firstTry == null ? "—" : `${Math.round(r.firstTry * 100)} %`}${r.trend ? ` <span class="trend-${r.trend}" title="динамика">${arrow[r.trend]}</span>` : ""}</td>
      <td>${r.flags.length ? r.flags.map((f) => `<span class="ov-flag">${esc(f)}</span>`).join("") : '<span class="ov-ok">всё хорошо</span>'}</td>
    </tr>`).join("");
    $("overviewRows").querySelectorAll(".ov-name").forEach((b) => b.addEventListener("click", () => {
      Profiles.setActive(b.dataset.id);
      render();
      $("childTabs").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
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
    $("fJudge").value = s.judge === "adult" ? "adult" : "auto";
    $("fUnlockAll").checked = !!s.unlockAll;
    $("deleteChild").disabled = Profiles.list().length <= 1;

    const history = Session.history();
    renderHomework(p, history);
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
        `<tr><td>${esc(SKILL_LABEL[a.skill] || a.skill)}</td><td>${a.attempt}</td><td class="tr">${esc(a.transcript || "(тишина)")}</td><td><span class="tag tag-${a.verdict}">${esc(VERDICT_LABEL[a.verdict] || a.verdict)}</span></td><td>${a.source === "tap" ? "👆 жест" : a.source === "trace" ? "✏️ палец" : a.source === "adult" ? "👂 взрослый" : esc(a.source || "")}</td><td>${a.responseSec == null ? "—" : a.responseSec + " с"}</td></tr>`).join("");
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
          ${h.adultAnswers ? `<p class="muted">👂 оценил взрослый (без распознавания речи): ${h.adultAnswers}</p>` : ""}
          ${h.visualHints ? `<p class="muted">🖼 попыток с подсказкой-картинкой: ${h.visualHints}</p>` : ""}
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


  // ------------------------------------------------ homework (homework.js)
  const THERAPIST_KEY = "ertegim.therapist";
  const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

  function renderHomework(p, history) {
    const plan = p.homework ? Homework.normalizePlan(p.homework, ACTIVITY_IDS) : null;
    const assigned = plan ? plan.activities : p.settings.assigned;
    $("assignedList").innerHTML = ACTIVITY_IDS.map((id) =>
      `<label class="assign"><input type="checkbox" value="${id}" ${assigned.includes(id) ? "checked" : ""}> ${esc(activityTitle(id))}</label>`).join("");
    $("hwPerWeek").value = String(plan ? plan.perWeek : 3);
    $("hwNote").value = plan ? plan.note : "";
    $("hwFrom").value = (plan && plan.from) || lsGet(THERAPIST_KEY);
    $("hwLink").hidden = true;
    // On the parents' device the plan came through a link: say from whom.
    const received = plan && p.linkedId;
    $("hwReceived").hidden = !received;
    if (received) $("hwReceived").innerHTML = `📬 Задание получено по ссылке${plan.from ? ` от <b>${esc(plan.from)}</b>` : ""}, ${esc(fmtDateTime(plan.createdAt))}. Когда позанимаетесь — нажмите «📤 Отправить логопеду» ниже.`;
    const progress = plan ? Homework.weekProgress(plan, history) : [];
    $("hwProgress").innerHTML = progress.length
      ? `<div class="muted">Эта неделя (с понедельника):</div>` + progress.map((x) =>
          `<div class="hw-row${x.met ? " met" : ""}"><span class="hw-bar"><i style="width:${Math.min(100, Math.round((x.done / x.target) * 100))}%"></i></span>${x.met ? "✅" : "⏳"} ${esc(activityTitle(x.id))} — ${x.done} из ${x.target}</div>`).join("")
      : `<div class="muted">Задание не выдано.</div>`;
    $("hwClear").disabled = !plan && !p.settings.assigned.length;
  }

  function readPlanForm() {
    const p = Profiles.active();
    return Homework.normalizePlan({
      activities: [...$("assignedList").querySelectorAll("input:checked")].map((i) => i.value),
      perWeek: Number($("hwPerWeek").value),
      note: $("hwNote").value,
      from: $("hwFrom").value,
      child: p.name,
      // The link always points back to THIS device's profile — unless this
      // device is itself the home one, then it keeps the therapist's id.
      pid: p.linkedId || p.id,
      createdAt: new Date().toISOString(),
    }, ACTIVITY_IDS);
  }

  function flash(text) {
    $("hwSaved").textContent = text; $("hwSaved").hidden = false;
    setTimeout(() => { $("hwSaved").hidden = true; }, 2200);
  }

  function savePlan() {
    const plan = readPlanForm();
    if (!plan) { alert("Отметьте хотя бы одно занятие."); return null; }
    if (plan.from) lsSet(THERAPIST_KEY, plan.from);
    const p = Profiles.active();
    Profiles.update(p.id, { homework: plan, settings: { assigned: plan.activities } });
    return plan;
  }

  $("hwForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (savePlan()) { render(); flash("Задание сохранено"); }
  });

  $("hwShare").addEventListener("click", async () => {
    const plan = savePlan();
    if (!plan) return;
    render();
    const link = Homework.planLink(location.origin, plan);
    $("hwLink").value = link; $("hwLink").hidden = false; $("hwLink").select();
    const text = `Ертегім: тапсырма — ${plan.child}. Сілтемені телефонда ашыңыз / Откройте ссылку на телефоне ребёнка:`;
    try {
      if (navigator.share) { await navigator.share({ title: "Ертегім — тапсырма", text, url: link }); flash("Отправлено"); return; }
    } catch { /* cancelled — fall back to copying */ }
    try { await navigator.clipboard.writeText(link); flash("Ссылка скопирована — вставьте в WhatsApp"); }
    catch { flash("Скопируйте ссылку из поля ниже"); }
  });

  $("hwClear").addEventListener("click", () => {
    const p = Profiles.active();
    if (!confirm(`Снять домашнее задание у «${p.name}»?`)) return;
    Profiles.update(p.id, { homework: null, settings: { assigned: [] } });
    render();
  });

  // Results played at home → this device. The file is the JSON export of
  // the parents' cabinet; sessions are merged into the matching child.
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let bundle = null;
    try { bundle = Homework.parseBundle(JSON.parse(await file.text())); } catch { bundle = null; }
    if (!bundle) { $("importStatus").textContent = "Это не файл результатов Ертегім."; return; }
    let target = Homework.matchProfile(Profiles.list(), bundle.child);
    if (!target) {
      if (!confirm(`Ребёнок «${bundle.child.name || "без имени"}» не найден. Создать новый профиль?`)) return;
      target = Profiles.add({ name: bundle.child.name });
    }
    Profiles.update(target.id, { remoteId: bundle.child.id });
    Profiles.setActive(target.id);
    const before = Session.history();
    const merged = Homework.mergeHistory(before, bundle.sessions);
    Session.replaceHistory(merged);
    const added = merged.length - before.length;
    render();
    $("importStatus").textContent = added > 0
      ? `✅ ${target.name}: добавлено занятий — ${added}.`
      : `${target.name}: новых занятий нет, всё уже загружено.`;
  });


  // ------------------------------------------------- this device (pilot)
  const fmtMb = (b) => `${(b / 1048576).toFixed(1)} МБ`;
  const dayWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дня" : "дней");
  let versionText = lsGet("ertegim.version");

  function anySessions() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === "ertegim.sessions" || (k && k.startsWith("ertegim.sessions:"))) {
          const a = JSON.parse(localStorage.getItem(k) || "[]");
          if (Array.isArray(a) && a.length) return true;
        }
      }
    } catch { /* no storage */ }
    return false;
  }

  function renderBackupState() {
    let age = null, need = false;
    try { age = Backup.backupAgeDays(localStorage); need = Backup.needsBackup(localStorage, anySessions()); } catch { /* no storage */ }
    $("backupStatus").innerHTML = age === null
      ? `<span class="warn-text">Копию ещё ни разу не сохраняли.</span>`
      : `Последняя копия: ${age === 0 ? "сегодня" : `${age} ${dayWord(age)} назад`}.`;
    $("backupBanner").hidden = !need;
    if (need) {
      $("backupBannerText").textContent = age === null
        ? "💾 На этом устройстве есть занятия, но резервной копии нет. Если браузер очистит данные, история пропадёт."
        : `💾 Резервной копии нет уже ${age} ${dayWord(age)}. Сохраните свежую — это одна кнопка.`;
    }
  }

  async function renderOffline() {
    if (typeof OfflineKit === "undefined" || !OfflineKit.supported()) {
      $("offStatus").textContent = "Этот браузер не умеет работать без интернета. Откройте сайт в Chrome или Safari по https.";
      $("offDownload").disabled = true;
      return;
    }
    try {
      const st = await OfflineKit.status();
      if (!st) { $("offStatus").textContent = "Нет связи с сервером — статус появится, когда будет интернет."; return; }
      const pct = st.bytes ? Math.round((st.doneBytes / st.bytes) * 100) : 0;
      $("offMeter").firstElementChild.style.width = `${pct}%`;
      $("offMeter").classList.toggle("done", st.ready);
      $("offStatus").innerHTML = st.ready
        ? `<span class="ok-text">✅ Готово: всё скачано (${fmtMb(st.bytes)}).</span>`
        : `Скачано ${fmtMb(st.doneBytes)} из ${fmtMb(st.bytes)}${st.doneBytes ? " — остальное докачается" : ""}.`;
      $("offDownload").textContent = st.ready ? "🔄 Проверить обновления" : "📥 Скачать для работы без интернета";
    } catch (err) {
      $("offStatus").textContent = `Не удалось проверить: ${err.message}`;
    }
  }

  async function renderStorage() {
    let persisted = false;
    try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch { /* unknown */ }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const parts = [persisted ? "🔒 Браузер не будет очищать данные сам." : "⚠️ Браузер может очистить данные при нехватке места."];
    if (ios && !standalone) parts.push("На iPhone/iPad добавьте Ертегім на экран «Домой» (Поделиться → На экран «Домой»): иначе Safari стирает данные сайта через 7 дней без посещений.");
    $("storageStatus").textContent = parts.join(" ");
  }

  function renderErrors() {
    const n = typeof ErrLog !== "undefined" ? ErrLog.list().length : 0;
    $("errCount").textContent = String(n);
    $("appVersion").textContent = versionText || "—";
  }

  async function refreshVersion() {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const v = (await res.json()).version;
      if (v) { versionText = v; lsSet("ertegim.version", v); renderErrors(); }
    } catch { /* offline: keep the last one seen */ }
  }

  function renderDevice() {
    renderBackupState();
    renderErrors();
    renderOffline();
    renderStorage();
  }

  $("offDownload").addEventListener("click", async () => {
    const btn = $("offDownload");
    btn.disabled = true;
    try {
      await OfflineKit.persist();
      const r = await OfflineKit.downloadAll((done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        $("offMeter").firstElementChild.style.width = `${pct}%`;
        $("offStatus").textContent = `Скачиваю… ${fmtMb(done)} из ${fmtMb(total)} (${pct}%)`;
      });
      await renderOffline();
      if (r.failed) $("offStatus").textContent += ` Не скачалось файлов: ${r.failed} — нажмите ещё раз при хорошем интернете.`;
      renderStorage();
    } catch (err) {
      $("offStatus").textContent = `Не получилось: ${err.message}. Проверьте интернет и нажмите ещё раз.`;
    } finally {
      btn.disabled = false;
    }
  });

  function saveDeviceBackup() {
    const data = Backup.collectBackup(localStorage);
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ertegim-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    Backup.markBackup(localStorage);
    renderBackupState();
  }
  $("backupNow").addEventListener("click", saveDeviceBackup);
  $("backupNow2").addEventListener("click", saveDeviceBackup);

  $("restoreFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let backup = null;
    try { backup = Backup.parseBackup(JSON.parse(await file.text())); } catch { backup = null; }
    if (!backup) { alert("Это не резервная копия Ертегім. Для файла результатов одного ребёнка используйте «Загрузить результаты из дома»."); return; }
    const d = Backup.describeBackup(backup);
    const when = backup.createdAt ? new Date(backup.createdAt).toLocaleString("ru-RU") : "неизвестно когда";
    if (!confirm(`Копия от ${when}: детей — ${d.children}, занятий — ${d.sessions}.\n\nВсе текущие данные на этом устройстве будут ЗАМЕНЕНЫ данными из копии. Продолжить?`)) return;
    Backup.restoreBackup(localStorage, backup);
    Backup.markBackup(localStorage);
    alert("Готово: данные восстановлены.");
    location.reload();
  });

  $("errCopy").addEventListener("click", async () => {
    const text = ErrLog.text(versionText);
    $("errText").value = text;
    $("errText").hidden = false;
    $("errText").select();
    try { await navigator.clipboard.writeText(text); $("errCopy").textContent = "✅ Скопировано"; setTimeout(() => { $("errCopy").textContent = "📋 Скопировать журнал"; }, 1800); } catch { /* the textarea is selected for manual copy */ }
  });
  $("errClear").addEventListener("click", () => {
    if (!confirm("Очистить журнал ошибок?")) return;
    ErrLog.clear();
    $("errText").hidden = true;
    renderErrors();
  });

  refreshVersion();

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
        judge: $("fJudge").value === "adult" ? "adult" : "auto",
        unlockAll: $("fUnlockAll").checked,
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

  // «Отправить логопеду»: the JSON export, shared as a file where the
  // browser can (phone → WhatsApp/Telegram), downloaded otherwise.
  $("exportJson").addEventListener("click", async () => {
    const p = Profiles.active();
    const data = exportBundle(p, Session.history(), Stickers.earned());
    const name = `ertegim-${p.name.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Ертегім — нәтижелер", text: `${p.name}: занятия дома` });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("printBtn").addEventListener("click", () => {
    document.querySelectorAll("details.session").forEach((d) => { d.open = true; });
    window.print();
  });
}
