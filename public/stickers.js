// Stickers — the child's reward collection. One sticker per completed
// story, one per hero met on the way, one per letter lesson, and a star for
// a run answered entirely first-try. Earned ids live in localStorage; the
// catalogue is here so the library (index.html) can draw the whole
// collection, earned and not, and the end screen can pop the new ones.
//
// Pure data + a tiny storage wrapper, no DOM: loaded as a classic <script>
// on both pages and require()'d by tests/stickers.test.js (same pattern as
// session.js, including the `_storage` test hook).

const STICKERS_KEY = "ertegim.stickers";

// Order here is the order on the library shelf.
const STICKER_CATALOG = {
  fox: { kk: "Түлкі досы", ru: "Друг лисёнка", img: "/images/fox-happy.png", hint_kk: "Ертегіні соңына дейін өт" },
  owl: { kk: "Үкімен таныстым", ru: "Познакомился с совёнком", img: "/images/cover-owl.png", hint_kk: "Өзен жолымен жүр" },
  bear: { kk: "Аюмен таныстым", ru: "Познакомился с медведем", img: "/images/cover-bear-fullbody.png", hint_kk: "Орман жолымен жүр" },
  "letter-a": { kk: "А әрпі", ru: "Буква А", img: "/images/lesson-a/alma.svg", hint_kk: "А әрпі сабағын өт" },
  star: { kk: "Жұлдыз", ru: "Всё с первого раза", img: "/images/sticker-star.svg", hint_kk: "Барлық сұраққа бірден жауап бер" },
};

// Which stickers a finished session earns. `summary` is Session.finish()'s
// result; a blocked or unfinished run earns nothing — stickers are for
// getting to the end, never for being judged on the way.
function stickersFor(activityId, summary) {
  if (!summary || !summary.completed || summary.blocked) return [];
  const out = [];
  if (activityId === "story") {
    out.push("fox");
    if (summary.route === "river") out.push("owl");
    if (summary.route === "forest") out.push("bear");
  } else if (STICKER_CATALOG[activityId]) {
    out.push(activityId); // a lesson's sticker shares its ACTIVITIES id
  }
  if (summary.questionsTotal > 0 && summary.firstTryCorrect === summary.questionsTotal) out.push("star");
  return out;
}

function stickerStorage() {
  try {
    return Stickers._storage || (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

// Per child when profiles.js is loaded (the first profile keeps the legacy key).
function stickerKey() {
  try {
    return typeof Profiles !== "undefined" && Profiles.scopedKey ? Profiles.scopedKey(STICKERS_KEY) : STICKERS_KEY;
  } catch {
    return STICKERS_KEY;
  }
}

const Stickers = {
  _storage: null,

  // { id: earnedAtISO } for everything earned on this device.
  earned() {
    try {
      const st = stickerStorage();
      const v = st ? st.getItem(stickerKey()) : null;
      const obj = v ? JSON.parse(v) : {};
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch {
      return {};
    }
  },

  has(id) {
    return Object.prototype.hasOwnProperty.call(this.earned(), id);
  },

  // Stores the given ids; returns only the ones that are NEW — those are
  // what the end screen celebrates. Unknown ids are ignored.
  award(ids, now = Date.now()) {
    const have = this.earned();
    const fresh = [];
    for (const id of ids || []) {
      if (!STICKER_CATALOG[id] || have[id]) continue;
      have[id] = new Date(now).toISOString();
      fresh.push(id);
    }
    if (fresh.length) {
      try {
        const st = stickerStorage();
        if (st) st.setItem(stickerKey(), JSON.stringify(have));
      } catch {
        // private mode / quota — the sticker still shows this once
      }
    }
    return fresh;
  },

  // [{ id, ...catalog, earnedAt|null }] in shelf order.
  shelf() {
    const have = this.earned();
    return Object.entries(STICKER_CATALOG).map(([id, meta]) => ({ id, ...meta, earnedAt: have[id] || null }));
  },
};

if (typeof module !== "undefined") {
  module.exports = { Stickers, STICKER_CATALOG, stickersFor, STICKERS_KEY };
}
