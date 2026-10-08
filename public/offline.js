// Offline support, shared by the pages (classic <script>) and the service
// worker (sw.js, importScripts). A speech therapist works in kindergartens
// and village schools with weak or no internet — the tale, the lessons and
// the cabinet must open and play from the device.
//
// What is cached and how (see sw.js for the fetch handler):
//   • shell  — HTML/JS/CSS/manifests: network-first, cache fallback, so a
//              deploy reaches the device as soon as it is online again;
//   • media  — audio, pictures, fox videos: cache-first. The list with a
//              content hash per file is public/offline-manifest.json
//              (tools/offline-manifest.js writes it, a test keeps it in sync);
//              an entry whose hash no longer matches is dropped and refetched;
//   • api    — /api/* (speech recognition, answer classifier) is NEVER cached:
//              without network the story switches to «the adult judges»
//              (app.js), it does not pretend to hear the child.
//
// Range requests: Safari plays <audio>/<video> only through 206 partial
// responses, and a Cache API entry is a whole file — rangeResponse() slices it.

const OFFLINE_SHELL_CACHE = "ertegim-shell-v1";
const OFFLINE_MEDIA_CACHE = "ertegim-media-v1";
const OFFLINE_CDN_CACHE = "ertegim-cdn-v1";
const OFFLINE_CACHES = [OFFLINE_SHELL_CACHE, OFFLINE_MEDIA_CACHE, OFFLINE_CDN_CACHE];
const OFFLINE_MANIFEST_URL = "/offline-manifest.json";
const OFFLINE_HASH_HEADER = "x-ertegim-hash";
const OFFLINE_MEDIA_RE = /\.(wav|mp3|m4a|ogg|mp4|webm|png|jpe?g|svg|webp|gif)$/i;
// Third-party files the pages need to look right offline. Rive is left out on
// purpose: its .riv rig does not exist yet, the fox falls back without it.
const OFFLINE_CDN_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

// "api" | "shell" | "media" | "cdn" | "skip"
function offlineKind(url, origin) {
  let u;
  try { u = new URL(url, origin); } catch { return "skip"; }
  if (u.origin !== origin) return OFFLINE_CDN_HOSTS.includes(u.hostname) ? "cdn" : "skip";
  if (u.pathname.startsWith("/api/")) return "api";
  if (u.pathname === "/sw.js") return "skip";
  if (OFFLINE_MEDIA_RE.test(u.pathname)) return "media";
  return "shell";
}

// Cache key for a same-origin shell page: the query does not change the file
// (/story.html?lesson=letter-a is story.html), and "/" is index.html.
function shellKey(url, origin) {
  const u = new URL(url, origin);
  return u.origin + (u.pathname === "/" ? "/index.html" : u.pathname);
}

// "bytes=a-b" | "bytes=a-" | "bytes=-n" → { start, end } (inclusive) or null.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "") || !(size > 0)) return null;
  let start, end;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

// A whole cached response → the 206 slice the request asked for (or the
// whole thing when there is no usable Range header).
async function rangeResponse(response, rangeHeader) {
  const buf = await response.arrayBuffer();
  const type = response.headers.get("content-type") || "application/octet-stream";
  const r = rangeHeader ? parseRange(rangeHeader, buf.byteLength) : null;
  if (!r) {
    return new Response(buf, { status: 200, headers: { "Content-Type": type, "Content-Length": String(buf.byteLength), "Accept-Ranges": "bytes" } });
  }
  const part = buf.slice(r.start, r.end + 1);
  return new Response(part, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": type,
      "Content-Length": String(part.byteLength),
      "Content-Range": `bytes ${r.start}-${r.end}/${buf.byteLength}`,
      "Accept-Ranges": "bytes",
    },
  });
}

// { "/audio/x.wav": { hash, bytes } } from the manifest's media list.
function mediaIndex(manifest) {
  const out = {};
  for (const f of (manifest && manifest.media) || []) out[f.url] = f;
  return out;
}

// Should a cached media entry go? Yes when the app no longer ships it, when
// its content changed, and when it carries no version stamp at all (cached
// before the manifest was known) — an unstamped file could never be told
// apart from an outdated one, so it is refetched once and stamped.
function isStaleMedia(path, cachedHash, index) {
  const want = index && index[path];
  if (!want) return true;
  return cachedHash !== want.hash;
}

// The fox clips ship twice — WebM (smaller) and MP4 (iOS cannot play WebM),
// characters.js picks one per browser. A device downloads only its own.
function mediaForDevice(media, canPlayWebm) {
  const urls = new Set(media.map((f) => f.url));
  return media.filter((f) => {
    if (f.url.endsWith(".webm")) return canPlayWebm;
    if (f.url.endsWith(".mp4") && canPlayWebm) return !urls.has(f.url.replace(/\.mp4$/, ".webm"));
    return true;
  });
}

// What is still to download: missing files and files whose hash changed.
// `have` = { url: hash } of what the media cache holds.
function offlinePlan(manifest, have, canPlayWebm = true) {
  const media = mediaForDevice((manifest && manifest.media) || [], canPlayWebm);
  const todo = media.filter((f) => have[f.url] !== f.hash);
  const bytes = media.reduce((a, f) => a + f.bytes, 0);
  const todoBytes = todo.reduce((a, f) => a + f.bytes, 0);
  return { files: media.length, todo, bytes, doneBytes: bytes - todoBytes, ready: todo.length === 0 && media.length > 0 };
}

// ------------------------------------------------------------ page side ----
const OfflineKit = {
  supported() {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof caches !== "undefined"
      && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  },

  // Registers sw.js and refreshes the manifest in the background (the
  // worker prunes stale media when it sees a new one).
  register() {
    if (!this.supported()) return;
    const go = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline mode just stays off */ });
      fetch(OFFLINE_MANIFEST_URL, { cache: "no-store" }).catch(() => {});
    };
    if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
  },

  async manifest() {
    try {
      const res = await fetch(OFFLINE_MANIFEST_URL, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch { /* offline — use the cached copy */ }
    const c = await caches.match(OFFLINE_MANIFEST_URL);
    return c ? c.json() : null;
  },

  async cachedHashes() {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE);
    const have = {};
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      have[new URL(req.url).pathname] = res ? res.headers.get(OFFLINE_HASH_HEADER) || "" : "";
    }
    return have;
  },

  canPlayWebm() {
    try { return document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== ""; } catch { return false; }
  },

  async status() {
    const manifest = await this.manifest();
    if (!manifest) return null;
    return offlinePlan(manifest, await this.cachedHashes(), this.canPlayWebm());
  },

  // Downloads everything the manifest lists (media + shell). onProgress
  // gets (doneBytes, totalBytes). Returns the final status.
  async downloadAll(onProgress = () => {}) {
    const manifest = await this.manifest();
    if (!manifest) throw new Error("нет связи с сервером");
    const shell = await caches.open(OFFLINE_SHELL_CACHE);
    await Promise.all((manifest.shell || []).map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await shell.put(shellKey(url, location.origin), res);
      } catch { /* retried on the next run */ }
    }));
    const media = await caches.open(OFFLINE_MEDIA_CACHE);
    const plan = offlinePlan(manifest, await this.cachedHashes(), this.canPlayWebm());
    let done = plan.doneBytes;
    onProgress(done, plan.bytes);
    const queue = [...plan.todo];
    let failed = 0;
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        try {
          const res = await fetch(f.url, { cache: "reload" });
          if (!res.ok) throw new Error(res.status);
          const blob = await res.blob();
          const headers = new Headers({ "Content-Type": res.headers.get("content-type") || blob.type || "application/octet-stream" });
          headers.set(OFFLINE_HASH_HEADER, f.hash);
          await media.put(location.origin + f.url, new Response(blob, { status: 200, headers }));
          done += f.bytes;
        } catch {
          failed++;
        }
        onProgress(done, plan.bytes);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const st = await this.status();
    return { ...st, failed };
  },

  // Asks the browser not to evict this site's storage under pressure —
  // history and profiles live in localStorage, the offline files in caches.
  async persist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      }
    } catch { /* not supported */ }
    return false;
  },
};

if (typeof module !== "undefined") {
  module.exports = {
    offlineKind, shellKey, parseRange, rangeResponse, mediaIndex, mediaForDevice, offlinePlan, isStaleMedia, OfflineKit,
    OFFLINE_SHELL_CACHE, OFFLINE_MEDIA_CACHE, OFFLINE_CDN_CACHE, OFFLINE_CACHES, OFFLINE_MANIFEST_URL, OFFLINE_HASH_HEADER,
  };
}
