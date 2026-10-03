// Child profiles — the therapist's cabinet keeps several children on one
// device. Everything that used to be device-wide (the tale's memory, the
// report history, the stickers) is scoped by the ACTIVE profile through
// scopedKey(): the very first profile keeps the old un-suffixed keys, so a
// device that already has history sees it under «Бала» after the update
// instead of losing it.
//
// Per-child settings override the app's defaults (see app.js gentleMode /
// maxReasks / vad*): a child with a speech delay gets longer pauses and more
// re-asks without the operator flipping switches every session. Attempt
// transcripts are OFF by default — the privacy note promises sentences are
// not stored — and a specialist turns them on per child, knowingly.
//
// Plain data + storage, no DOM: classic <script> on every page, require()'d
// by tests/profiles.test.js (same `_storage` hook as session.js).

const PROFILES_KEY = "ertegim.profiles";
const DEFAULT_PROFILE_ID = "default";

const SETTING_DEFAULTS = {
  gentle: null,          // null = follow the activity / operator; true/false forces
  maxReasks: null,       // 1..3, null = profile does not override
  silenceMs: null,       // VAD end-of-phrase silence, null = default/gentle profile
  silenceTimeoutMs: null, // total-silence re-ask, null = default/gentle profile
  keepTranscripts: false, // store each attempt's transcript in the history
  assigned: [],           // activity ids the library highlights as "today's task"
};

function profileStorage() {
  try {
    return Profiles._storage || (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

function readState() {
  try {
    const st = profileStorage();
    const v = st ? st.getItem(PROFILES_KEY) : null;
    const s = v ? JSON.parse(v) : null;
    if (s && Array.isArray(s.list) && s.list.length) return s;
  } catch {
    // fall through to the default
  }
  return null;
}

function writeState(state) {
  try {
    const st = profileStorage();
    if (st) st.setItem(PROFILES_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota — profiles stay in memory for this page only
  }
}

function newId(now) {
  return `p${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function normalizeSettings(s) {
  const out = { ...SETTING_DEFAULTS };
  if (!s || typeof s !== "object") return out;
  if (s.gentle === true || s.gentle === false) out.gentle = s.gentle;
  if (Number.isInteger(s.maxReasks) && s.maxReasks >= 1 && s.maxReasks <= 3) out.maxReasks = s.maxReasks;
  if (Number.isFinite(s.silenceMs) && s.silenceMs >= 500 && s.silenceMs <= 10000) out.silenceMs = Math.round(s.silenceMs);
  if (Number.isFinite(s.silenceTimeoutMs) && s.silenceTimeoutMs >= 3000 && s.silenceTimeoutMs <= 60000) out.silenceTimeoutMs = Math.round(s.silenceTimeoutMs);
  out.keepTranscripts = s.keepTranscripts === true;
  out.assigned = Array.isArray(s.assigned) ? s.assigned.filter((x) => typeof x === "string").slice(0, 20) : [];
  return out;
}

let memState = null; // used when storage is unavailable, so a page still has a profile

const Profiles = {
  _storage: null,

  // { list: [profile], activeId } — creates the default profile on first use.
  state(now = Date.now()) {
    const stored = readState();
    if (stored) {
      memState = stored;
    } else if (!memState) {
      memState = {
        list: [{ id: DEFAULT_PROFILE_ID, name: "Бала", age: null, notes: "", settings: { ...SETTING_DEFAULTS }, createdAt: new Date(now).toISOString() }],
        activeId: DEFAULT_PROFILE_ID,
      };
      writeState(memState);
    }
    if (!memState.list.some((p) => p.id === memState.activeId)) memState.activeId = memState.list[0].id;
    return memState;
  },

  list() {
    return this.state().list.map((p) => ({ ...p, settings: normalizeSettings(p.settings) }));
  },

  get(id) {
    return this.list().find((p) => p.id === id) || null;
  },

  active() {
    const s = this.state();
    return this.get(s.activeId) || this.list()[0];
  },

  setActive(id) {
    const s = this.state();
    if (!s.list.some((p) => p.id === id)) return false;
    s.activeId = id;
    writeState(s);
    return true;
  },

  add({ name, age = null, notes = "", settings = {} } = {}, now = Date.now()) {
    const s = this.state(now);
    const clean = String(name || "").trim().slice(0, 40) || `Бала ${s.list.length + 1}`;
    const p = { id: newId(now), name: clean, age: Number.isFinite(age) ? age : null, notes: String(notes || "").slice(0, 500), settings: normalizeSettings(settings), createdAt: new Date(now).toISOString() };
    s.list.push(p);
    s.activeId = p.id;
    writeState(s);
    return p;
  },

  update(id, patch = {}) {
    const s = this.state();
    const p = s.list.find((x) => x.id === id);
    if (!p) return null;
    if (patch.name !== undefined) p.name = String(patch.name || "").trim().slice(0, 40) || p.name;
    if (patch.age !== undefined) p.age = Number.isFinite(patch.age) ? patch.age : null;
    if (patch.notes !== undefined) p.notes = String(patch.notes || "").slice(0, 500);
    if (patch.settings !== undefined) p.settings = normalizeSettings({ ...normalizeSettings(p.settings), ...patch.settings });
    writeState(s);
    return { ...p, settings: normalizeSettings(p.settings) };
  },

  // Removes the profile AND its scoped data (history, memory, stickers). The
  // last profile cannot be removed — a page always needs one.
  remove(id, scopedBases = ["ertegim.sessions", "ertegim.memory", "ertegim.stickers"]) {
    const s = this.state();
    if (s.list.length <= 1) return false;
    const i = s.list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    s.list.splice(i, 1);
    if (s.activeId === id) s.activeId = s.list[0].id;
    writeState(s);
    try {
      const st = profileStorage();
      if (st && st.removeItem) for (const base of scopedBases) st.removeItem(Profiles.scopedKey(base, id));
    } catch { /* nothing to clean */ }
    return true;
  },

  // Storage key for a per-child value. The default (first) profile keeps the
  // legacy un-suffixed key, see the header comment.
  scopedKey(base, id = this.active().id) {
    return id === DEFAULT_PROFILE_ID ? base : `${base}:${id}`;
  },

  settings(id = this.active().id) {
    const p = this.get(id);
    return p ? p.settings : { ...SETTING_DEFAULTS };
  },
};

if (typeof module !== "undefined") {
  module.exports = { Profiles, PROFILES_KEY, DEFAULT_PROFILE_ID, SETTING_DEFAULTS, normalizeSettings };
}
