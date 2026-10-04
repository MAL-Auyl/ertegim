// Whole-device backup for the therapist's tablet: every child, their
// histories, stickers, homework and settings — everything the app keeps
// under "ertegim.*" in this browser — in ONE file, and back. localStorage
// can be wiped (browser «clear data», iOS Safari after 7 days without a
// visit for a site not on the home screen, a new tablet); this file is
// what survives that. Per-child «Отправить логопеду» (cabinet.js) stays the
// way to move ONE child's sessions between devices; this is the safety net.
//
// Pure functions over a Storage-like object, no DOM.
const BACKUP_PREFIX = "ertegim.";
const BACKUP_STAMP_KEY = "ertegim.lastBackup";
const BACKUP_REMIND_DAYS = 7;

function storageKeys(st) {
  const out = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) out.push(k);
  }
  return out.sort();
}

function collectBackup(st, now = Date.now()) {
  const keys = {};
  for (const k of storageKeys(st)) {
    if (k === BACKUP_STAMP_KEY) continue;
    keys[k] = st.getItem(k);
  }
  return { app: "Ертегім", kind: "device-backup", v: 1, createdAt: new Date(now).toISOString(), keys };
}

function parseBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "Ертегім" || obj.kind !== "device-backup" || !obj.keys || typeof obj.keys !== "object") return null;
  const keys = {};
  for (const [k, v] of Object.entries(obj.keys)) {
    if (k.startsWith(BACKUP_PREFIX) && k !== BACKUP_STAMP_KEY && typeof v === "string") keys[k] = v;
  }
  return Object.keys(keys).length ? { createdAt: String(obj.createdAt || ""), keys } : null;
}

// Replaces this device's data with the backup's. Returns how many keys
// were written. The caller confirms with the user first.
function restoreBackup(st, backup) {
  for (const k of storageKeys(st)) if (k !== BACKUP_STAMP_KEY) st.removeItem(k);
  let n = 0;
  for (const [k, v] of Object.entries(backup.keys)) { st.setItem(k, v); n++; }
  return n;
}

function markBackup(st, now = Date.now()) {
  try { st.setItem(BACKUP_STAMP_KEY, new Date(now).toISOString()); } catch { /* quota */ }
}

// Whole days since the last device backup; null = never.
function backupAgeDays(st, now = Date.now()) {
  let v = null;
  try { v = st.getItem(BACKUP_STAMP_KEY); } catch { return null; }
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86400000));
}

// Remind when there is something to lose and no fresh copy of it.
function needsBackup(st, hasSessions, now = Date.now()) {
  if (!hasSessions) return false;
  const age = backupAgeDays(st, now);
  return age === null || age >= BACKUP_REMIND_DAYS;
}

// How many children and sessions a backup holds — shown before restoring.
function describeBackup(backup) {
  let children = 0, sessions = 0;
  try {
    const p = JSON.parse(backup.keys["ertegim.profiles"] || "null");
    children = p && Array.isArray(p.list) ? p.list.length : 0;
  } catch { /* none */ }
  for (const [k, v] of Object.entries(backup.keys)) {
    if (k === "ertegim.sessions" || k.startsWith("ertegim.sessions:")) {
      try { const a = JSON.parse(v); if (Array.isArray(a)) sessions += a.length; } catch { /* skip */ }
    }
  }
  return { children: Math.max(children, sessions ? 1 : 0), sessions };
}

const Backup = { collectBackup, parseBackup, restoreBackup, markBackup, backupAgeDays, needsBackup, describeBackup, BACKUP_REMIND_DAYS, BACKUP_STAMP_KEY };

if (typeof module !== "undefined") {
  module.exports = { Backup, ...Backup };
}
