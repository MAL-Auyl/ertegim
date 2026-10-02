// Parent report renderer. Takes the summary Session.finish() produced for
// this game plus the stored history of previous games and fills the
// #reportPanel markup in index.html. Pure helpers are exported for tests.

const SKILL_META = {
  count: { icon: "🦊", name: "Санау" },
  choice: { icon: "🐻", name: "Жол таңдау" },
  empathy: { icon: "💛", name: "Батылдық беру" },
  rhyme: { icon: "🦉", name: "Ұйқас" },
  letter: { icon: "🔤", name: "Әріптер" },
  plus: { icon: "➕", name: "Қосу" },
  minus: { icon: "➖", name: "Азайту" },
  write: { icon: "✏️", name: "Жазу" },
};
// The fairy tale always lists its four skills (a route skips one — shown
// locked). A lesson exercises one skill, so only what was asked is listed.
const TALE_SKILLS = ["count", "choice", "empathy", "rhyme"];

function fmtSec(sec) {
  return sec == null ? "—" : `${sec.toFixed(1)}с`;
}

function skillPercent(state) {
  return { first: 100, reask: 60, reveal: 30 }[state] || 0;
}

function skillLabel(state) {
  return { first: "бірден", reask: "қайта сұрап", reveal: "көмекпен" }[state] || "өтпеді";
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

  const shown = Object.entries(SKILL_META).filter(([skill]) =>
    (summary.skills[skill] || "skipped") !== "skipped" || (summary.route && TALE_SKILLS.includes(skill)));
  el(doc, "reportSkills").innerHTML = shown.map(([skill, meta], i) => {
    const state = summary.skills[skill] || "skipped";
    return `<div class="mastery-row${state === "skipped" ? " locked" : ""}" style="animation-delay:${240 + i * 40}ms">
      <span class="mastery-name">${meta.icon} ${meta.name}</span>
      <div class="mastery-bar"><div class="mastery-fill" style="width:${skillPercent(state)}%"></div></div>
      <span class="skill-state">${skillLabel(state)}</span>
    </div>`;
  }).join("");

  const rows = history.slice(0, 5);
  el(doc, "reportHistory").innerHTML = rows.map((s) => {
    const r = historyRowText(s);
    return `<div class="history-row"><span>${r.date} ${r.flag}</span><span>🎯 ${r.acc}</span><span>⚡ ${r.avg}</span></div>`;
  }).join("");
  el(doc, "reportHistoryEmpty").style.display = rows.length ? "none" : "block";
}

if (typeof module !== "undefined") {
  module.exports = { renderReport, fmtSec, skillLabel, skillPercent, historyRowText, esc };
}
