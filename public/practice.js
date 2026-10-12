// Homework round in the therapist's cabinet: how the current assignment
// went, and a draft of the next one.
//
// A round is everything since the plan was issued (plan.createdAt) — what
// the child played at home (results link / file) or in the clinic. The
// summary says, per assigned activity, how many times it was done against
// the weekly target, how the answers went, how often a picture hint or the
// adult's judgement was needed; and, per speech area (skillmap.js), the
// first-try share before the round vs during it.
//
// The proposal is a draft, never applied by itself: the therapist chooses
// the next set. Rules, per assigned activity:
//   - not opened at all          → keep (ask the parents why);
//   - ≥ 2 sessions, ≥ 80 % first → replace with a similar activity the child
//                                  has played least recently (same main
//                                  area), or drop when there is none;
//   - otherwise                  → keep, with the share as the reason.
// Then areas that need attention on the whole skill map and are not
// covered yet get an activity — up to 2, the plan grows by one activity a
// round at most (never past 4); a week where less than half was done
// suggests one session a week fewer.
//
// Pure data, no DOM: classic <script> on cabinet.html after homework.js and
// skillmap.js, require()'d by tests/practice.test.js.

const PRACTICE_DAY = 86400000;
const PRACTICE_MASTERED = 0.8;
const PRACTICE_HELP = 0.5;
const PRACTICE_MAX_ACTIVITIES = 4;
const PRACTICE_MAX_ADDS = 2;
const PRACTICE_MIN_ANSWERS = 3; // fewer answers → no conclusion about an activity

const PRACTICE_DEPS = typeof Homework !== "undefined" && typeof SkillMap !== "undefined"
  ? { Homework, SkillMap, activities: typeof ACTIVITIES !== "undefined" ? ACTIVITIES : {} }
  : (typeof require === "function"
    ? { Homework: require("./homework.js").Homework, SkillMap: require("./skillmap.js").SkillMap, activities: require("./story.js").ACTIVITIES }
    : null);

const practicePct = (x) => `${Math.round(x * 100)} %`;

// The areas an activity trains, most questions first.
function activityAreas(id, activities = PRACTICE_DEPS.activities) {
  const a = activities[id];
  if (!a) return [];
  const n = {};
  for (const k of a.skills || []) {
    const area = PRACTICE_DEPS.SkillMap.skillAreaOf(k);
    if (area) n[area] = (n[area] || 0) + 1;
  }
  return Object.keys(n).sort((x, y) => n[y] - n[x]);
}

function roundSummary(plan, history, { now = Date.now(), activities = PRACTICE_DEPS.activities } = {}) {
  if (!plan) return null;
  const { Homework: H, SkillMap: M } = PRACTICE_DEPS;
  const h = Array.isArray(history) ? history.filter((s) => s && typeof s.date === "string") : [];
  const start = new Date(plan.createdAt).getTime();
  const round = H.sessionsSince(plan, h);
  const before = h.filter((s) => new Date(s.date).getTime() < start);
  const days = Math.max(1, Math.round((now - start) / PRACTICE_DAY)); // issued Mon, today next Mon → 7
  // the weekly target, pro-rated after the first week (day 10 of 3/week → 5)
  const expected = Math.max(plan.perWeek, Math.ceil((plan.perWeek * days) / 7));
  const sum = (ss, f) => ss.reduce((a, s) => a + (Number(s[f]) || 0), 0);
  const perActivity = plan.activities.map((id) => {
    const ss = round.filter((s) => (s.activity || "story") === id);
    const asked = sum(ss, "questionsTotal"), first = sum(ss, "firstTryCorrect");
    return {
      id, sessions: ss.length,
      done: ss.filter((s) => s.completed).length,
      expected,
      asked, first, firstShare: asked ? first / asked : null,
      hints: sum(ss, "visualHints"), adult: sum(ss, "adultAnswers"), gesture: sum(ss, "gestureAnswers"),
      last: ss.length ? ss[0].date : null,
    };
  });
  const mapBefore = M.skillMap(before, { now, activities });
  const mapRound = M.skillMap(round, { now, activities });
  const areas = mapRound.filter((a) => a.asked).map((a) => {
    const b = mapBefore.find((x) => x.id === a.id);
    return { id: a.id, icon: a.icon, ru: a.ru, kk: a.kk, asked: a.asked, firstShare: a.firstShare, beforeAsked: b.asked, beforeShare: b.firstShare };
  });
  return {
    since: plan.createdAt, days,
    sessions: round.length,
    extra: round.filter((s) => !plan.activities.includes(s.activity || "story")).length,
    done: perActivity.reduce((a, x) => a + Math.min(x.done, x.expected), 0),
    expected: perActivity.reduce((a, x) => a + x.expected, 0),
    perActivity, areas,
  };
}

function nextPlanProposal(plan, history, { now = Date.now(), activities = PRACTICE_DEPS.activities } = {}) {
  const r = roundSummary(plan, history, { now, activities });
  if (!r) return null;
  const { SkillMap: M } = PRACTICE_DEPS;
  const h = Array.isArray(history) ? history : [];
  const items = [], list = [];
  const taken = (id) => list.includes(id) || plan.activities.includes(id);

  for (const a of r.perActivity) {
    if (!a.sessions) { items.push({ id: a.id, action: "keep", reason: "ещё не открывали — уточните у родителей, что помешало" }); list.push(a.id); continue; }
    if (!a.asked) { items.push({ id: a.id, action: "keep", reason: "ответов пока нет" }); list.push(a.id); continue; }
    if (a.sessions >= 2 && a.firstShare >= PRACTICE_MASTERED) {
      const area = activityAreas(a.id, activities)[0];
      const next = area ? M.areaSuggestions(area, h, activities, 99).find((id) => !taken(id)) : null;
      if (next) { items.push({ id: a.id, action: "replace", with: next, reason: `получается: ${practicePct(a.firstShare)} ответов сразу — заменить похожим` }); list.push(next); }
      else items.push({ id: a.id, action: "drop", reason: `получается: ${practicePct(a.firstShare)} ответов сразу — можно убрать` });
      continue;
    }
    items.push({ id: a.id, action: "keep", reason: a.asked < PRACTICE_MIN_ANSWERS ? `пока мало ответов (${a.asked}) — продолжать`
      : a.firstShare < PRACTICE_HELP ? `чаще с подсказкой (${practicePct(a.firstShare)} сразу) — продолжать` : `в процессе: ${practicePct(a.firstShare)} ответов сразу` });
    list.push(a.id);
  }

  // Areas that need attention and nothing in the list trains yet.
  const covered = new Set(list.flatMap((id) => activityAreas(id, activities)));
  const order = { stale: 0, help: 1, new: 2 };
  const map = M.skillMap(h, { now, activities }).filter((a) => a.attention && !covered.has(a.id))
    .sort((x, y) => order[x.attention] - order[y.attention]);
  // The parents' load grows by one activity a round at most.
  const cap = Math.min(PRACTICE_MAX_ACTIVITIES, Math.max(3, plan.activities.length + 1));
  let adds = 0;
  for (const a of map) {
    if (adds >= PRACTICE_MAX_ADDS || list.length >= cap) break;
    if (covered.has(a.id)) continue;
    const id = M.areaSuggestions(a.id, h, activities, 99).find((x) => !taken(x));
    if (!id) continue;
    const why = a.attention === "stale" ? `не практиковали ${a.daysSince} дн.` : a.attention === "help" ? "чаще с подсказкой" : "ещё не практиковали";
    items.push({ id, action: "add", area: a.id, reason: `${a.icon} ${a.ru}: ${why}` });
    list.push(id);
    adds++;
    for (const x of activityAreas(id, activities)) covered.add(x);
  }

  let perWeek = { from: plan.perWeek, to: plan.perWeek, reason: null };
  if (r.days >= 6 && r.expected) {
    const ratio = r.done / r.expected;
    if (ratio < 0.5 && plan.perWeek > 1) perWeek = { from: plan.perWeek, to: plan.perWeek - 1, reason: `сделано ${r.done} из ${r.expected} — возможно, нагрузка велика` };
    else if (ratio >= 1) perWeek.reason = "задание выполнено полностью";
  }
  return { items, activities: list, perWeek, summary: r };
}

const Practice = { roundSummary, nextPlanProposal, activityAreas, PRACTICE_MASTERED, PRACTICE_MAX_ACTIVITIES };

if (typeof module !== "undefined") {
  module.exports = { Practice, ...Practice };
}
