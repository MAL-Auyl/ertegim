// Parent report renderer. Takes the summary Session.finish() produced for
// this game plus the stored history of previous games and fills the
// #reportPanel markup in story.html. Pure helpers are exported for tests.

const SKILL_META = {
  // fox tale
  count: { icon: "🦊", name: "Санау" },
  choice: { icon: "🐻", name: "Жол таңдау" },
  empathy: { icon: "💛", name: "Батылдық беру" },
  rhyme: { icon: "🦉", name: "Ұйқас" },
  // letter lesson «А» (LESSON_A in story.js)
  sound_a: { icon: "🔤", name: "«А» дыбысы" },
  word_a: { icon: "🍎", name: "«Алма» сөзі" },
  pick_a: { icon: "👆", name: "А-ны суреттен тапты" },
  open_a: { icon: "💛", name: "Ана туралы айтты" },
  // letter lessons «О» and «Ұ» (LESSON_O / LESSON_U in story.js)
  sound_o: { icon: "🔤", name: "«О» дыбысы" },
  word_o: { icon: "🔥", name: "«От» сөзі" },
  pick_o: { icon: "👆", name: "О-ны суреттен тапты" },
  open_o: { icon: "🧸", name: "Ойыншық туралы айтты" },
  sound_u: { icon: "🔤", name: "«Ұ» дыбысы" },
  word_u: { icon: "✈️", name: "«Ұшақ» сөзі" },
  pick_u: { icon: "👆", name: "Ұ-ны суреттен тапты" },
  open_u: { icon: "💛", name: "Не ұнайтынын айтты" },
  letter: { icon: "🔤", name: "Әріптер" },
  plus: { icon: "➕", name: "Қосу" },
  minus: { icon: "➖", name: "Азайту" },
  write: { icon: "✏️", name: "Жазу" },
};

// Only the rows this session actually had: summarize() keys `skills` by the
// activity's own list, so a letter lesson never shows the tale's four rows
// (all "skipped") and the tale never shows the lesson's.
function skillRows(summary) {
  return Object.keys(summary.skills || {}).filter((k) => SKILL_META[k]).map((k) => [k, SKILL_META[k]]);
}

function fmtSec(sec) {
  return sec == null ? "—" : `${sec.toFixed(1)}с`;
}

function skillPercent(state) {
  return { first: 100, reask: 60, reveal: 30 }[state] || 0;
}

function skillLabel(state) {
  return { first: "бірден", reask: "қайта сұрап", reveal: "көмекпен" }[state] || "өтпеді";
}

// Stars for the sticker: 3 — answered first time, 2 — after a re-ask,
// 1 — the hero had to show the answer, 0 — the question never came up.
function skillStars(state) {
  return { first: 3, reask: 2, reveal: 1 }[state] || 0;
}
function starsHTML(n, total = 3) {
  let out = "";
  for (let i = 0; i < total; i++) out += i < n ? "★" : `<span class="off">★</span>`;
  return out;
}

// One sentence the fox says to the parent, built from the real numbers —
// the diary's headline, before any chart.
function summaryLine(summary) {
  const words = summary.words.length;
  const total = summary.questionsTotal || 0;
  const first = summary.firstTryCorrect || 0;
  if (summary.blocked) return "Бүгін ойын ерте аяқталды. Келесі жолы тағы байқап көрейік!";
  if (total === 0) return "Бүгін біз әлі сөйлесе алмадық — келесі жолы міндетті түрде!";
  const w = words ? `Мен ${words} сөз естідім! ` : "";
  if (first === total) return `${w}Барлық ${total} сұраққа бірден жауап бердің — жарайсың!`;
  if (first === 0) return `${w}Бірге ${total} сұрақты өттік — әр жолы мен көмектестім. Тағы ойнайық!`;
  return `${w}${total} сұрақтың ${first}-іне бірден жауап бердің. Жарайсың!`;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function historyRowText(s) {
  return {
    date: new Date(s.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
    acc: `${s.firstTryCorrect}/${s.questionsTotal}`,
    avg: fmtSec(s.avgResponseSec),
    flag: s.blocked ? "⛔" : s.completed ? "" : "…",
    // first-try share as 0..3 stars, same scale as the stickers
    stars: s.questionsTotal ? Math.round((s.firstTryCorrect / s.questionsTotal) * 3) : 0,
  };
}

function el(doc, id) { return doc.getElementById(id); }
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderReport(summary, history, doc = document) {
  el(doc, "reportWords").textContent = String(summary.words.length);
  el(doc, "reportAvg").textContent = fmtSec(summary.avgResponseSec);
  el(doc, "reportAcc").textContent = `${summary.firstTryCorrect}/${summary.questionsTotal}`;

  el(doc, "reportTags").innerHTML = summary.words.length
    ? summary.words.slice(0, 12).map((w) => `<span class="word-tag">${esc(w)}</span>`).join("")
    : `<span class="word-tag">—</span>`;

  el(doc, "reportTimeline").innerHTML = summary.moments.length
    ? summary.moments.map((m) => `<div class="timeline-item"><span class="timeline-time">${fmtClock(m.atSec)}</span><span>${esc(m.text_kk)}</span></div>`).join("")
    : `<div class="timeline-item"><span>Ерекше сәттер болған жоқ</span></div>`;

  const summaryEl = el(doc, "reportSummary");
  if (summaryEl) summaryEl.textContent = summaryLine(summary);

  el(doc, "reportSkills").innerHTML = skillRows(summary).map(([skill, meta], i) => {
    const state = summary.skills[skill] || "skipped";
    return `<div class="sticker ${state}" style="animation-delay:${240 + i * 40}ms">
      <span class="sticker-icon">${meta.icon}</span>
      <span class="sticker-name">${meta.name}</span>
      <span class="sticker-stars" aria-label="${skillStars(state)} из 3">${starsHTML(skillStars(state))}</span>
      <span class="sticker-state">${skillLabel(state)}</span>
    </div>`;
  }).join("");

  // Picture-card answers (lesson "pick" nodes): shown only when there were
  // any, as one extra line under the skills — the parent/therapist should
  // see "understood, pointed, did not say it" as its own fact.
  const gestureEl = el(doc, "reportGesture");
  if (gestureEl) {
    const n = summary.gestureAnswers || 0;
    const a = summary.adultAnswers || 0;
    const lines = [];
    if (n) lines.push(`👆 ${n} жауап — сөзбен емес, суретті көрсетіп`);
    if (a) lines.push(`👂 ${a} жауапты ересек адам бағалады`);
    gestureEl.style.display = lines.length ? "block" : "none";
    gestureEl.textContent = lines.join(" · ");
  }

  const rows = history.slice(0, 5);
  el(doc, "reportHistory").innerHTML = rows.map((s) => {
    const r = historyRowText(s);
    return `<div class="history-row"><span>${r.date} ${r.flag}</span><span class="h-stars">${starsHTML(r.stars)}</span><span>⚡ ${r.avg}</span></div>`;
  }).join("");
  el(doc, "reportHistoryEmpty").style.display = rows.length ? "none" : "block";
}

if (typeof module !== "undefined") {
  module.exports = { renderReport, fmtSec, skillLabel, skillPercent, skillStars, starsHTML, summaryLine, historyRowText, esc, skillRows, SKILL_META };
}
