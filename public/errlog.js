// Pilot diagnostics: the last 30 errors this device hit (uncaught errors,
// rejected promises, plus notable failures the app reports itself — speech
// recognition down, microphone refused). Kept in localStorage on THIS
// device only; it leaves only inside the cabinet's device backup or when
// the therapist copies it for the developer. No child data goes in here:
// messages are code errors, not answers.
//
// Load it first on every page so it sees the errors of the scripts after it.
const ERRLOG_KEY = "ertegim.errors";
const ERRLOG_MAX = 30;

const ErrLog = {
  _storage: null,

  storage() {
    try { return this._storage || (typeof localStorage !== "undefined" ? localStorage : null); } catch { return null; }
  },

  list() {
    try {
      const st = this.storage();
      const v = st ? JSON.parse(st.getItem(ERRLOG_KEY) || "[]") : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },

  // Same message as the newest entry → count it instead of a new line, so
  // one error in a 60 fps loop cannot flush the whole log.
  note(msg, { src = "", page = "", now = Date.now(), version = "" } = {}) {
    const text = String(msg || "").slice(0, 300);
    if (!text) return;
    const list = this.list();
    const last = list[0];
    if (last && last.msg === text && last.src === src) {
      last.n = (last.n || 1) + 1;
      last.at = new Date(now).toISOString();
    } else {
      list.unshift({ at: new Date(now).toISOString(), msg: text, src: String(src).slice(0, 120), page: String(page).slice(0, 60), v: version || undefined });
    }
    try {
      const st = this.storage();
      if (st) st.setItem(ERRLOG_KEY, JSON.stringify(list.slice(0, ERRLOG_MAX)));
    } catch { /* quota — diagnostics are best-effort */ }
  },

  clear() {
    try { const st = this.storage(); if (st) st.removeItem(ERRLOG_KEY); } catch { /* nothing */ }
  },

  // Plain text for «Скопировать для разработчика».
  text(version = "") {
    const rows = this.list().map((e) => `${e.at} ${e.page || ""} ${e.n > 1 ? `×${e.n} ` : ""}${e.msg}${e.src ? ` @ ${e.src}` : ""}`);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return [`Ертегім ${version || "?"} · ${ua}`, ...rows].join("\n");
  },
};

if (typeof window !== "undefined" && typeof module === "undefined") {
  const page = () => location.pathname + location.search;
  const ver = () => { try { return localStorage.getItem("ertegim.version") || ""; } catch { return ""; } };
  window.addEventListener("error", (e) => {
    // Resource load failures (a missing image) arrive here too, without a message.
    if (!e.message) return;
    ErrLog.note(e.message, { src: `${(e.filename || "").replace(location.origin, "")}:${e.lineno || 0}`, page: page(), version: ver() });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    ErrLog.note(r && r.message ? r.message : String(r), { src: "promise", page: page(), version: ver() });
  });
}

if (typeof module !== "undefined") {
  module.exports = { ErrLog, ERRLOG_KEY, ERRLOG_MAX };
}
