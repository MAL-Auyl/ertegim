// Service worker: makes Ертегім open and play without internet. All the
// rules (what is shell / media / api, Range slicing) live in offline.js,
// shared with the pages; this file is only the event wiring.
/* global importScripts, offlineKind, shellKey, rangeResponse, mediaIndex, isStaleMedia,
   OFFLINE_SHELL_CACHE, OFFLINE_MEDIA_CACHE, OFFLINE_CDN_CACHE, OFFLINE_CACHES,
   OFFLINE_MANIFEST_URL, OFFLINE_HASH_HEADER */
importScripts("/offline.js");

const ORIGIN = self.location.origin;
const SHELL_TIMEOUT_MS = 4000;
let mediaHashes = null; // { "/audio/x.wav": { hash, bytes } } from the manifest

async function loadManifest(fromNetwork) {
  try {
    const res = fromNetwork ? await fetch(OFFLINE_MANIFEST_URL, { cache: "no-store" }) : await caches.match(ORIGIN + OFFLINE_MANIFEST_URL);
    if (!res || !res.ok) return null;
    if (fromNetwork) (await caches.open(OFFLINE_SHELL_CACHE)).put(ORIGIN + OFFLINE_MANIFEST_URL, res.clone());
    const m = await res.json();
    mediaHashes = mediaIndex(m);
    return m;
  } catch {
    return null;
  }
}

// Drops media whose content changed (hash mismatch) or that the app no
// longer ships; they are refetched on next use or by «Скачать для офлайна».
async function pruneMedia() {
  if (!mediaHashes) return;
  const cache = await caches.open(OFFLINE_MEDIA_CACHE);
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const got = res ? res.headers.get(OFFLINE_HASH_HEADER) : null;
    if (isStaleMedia(new URL(req.url).pathname, got, mediaHashes)) await cache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const m = await loadManifest(true);
    if (m && Array.isArray(m.shell)) {
      const cache = await caches.open(OFFLINE_SHELL_CACHE);
      await Promise.all(m.shell.map(async (url) => {
        try {
          const res = await fetch(url, { cache: "reload" });
          if (res.ok) await cache.put(shellKey(url, ORIGIN), res);
        } catch { /* filled in on first online visit */ }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("ertegim-") && !OFFLINE_CACHES.includes(name)) await caches.delete(name);
    }
    await loadManifest(false);
    await pruneMedia();
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function shellResponse(event) {
  const req = event.request;
  const key = shellKey(req.url, ORIGIN);
  const cache = await caches.open(OFFLINE_SHELL_CACHE);
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic") {
      await cache.put(key, res.clone());
      if (new URL(req.url).pathname === OFFLINE_MANIFEST_URL) {
        mediaHashes = mediaIndex(await res.clone().json());
        event.waitUntil(pruneMedia());
      }
    }
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    const res = await withTimeout(network, SHELL_TIMEOUT_MS);
    // A server error (deploy in progress, platform outage) must not replace
    // a working page the device already has.
    if (res.status >= 500) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await cache.match(ORIGIN + "/index.html");
      if (home) return home;
    }
    return network; // nothing cached: surface the real network error
  }
}

async function mediaResponse(req) {
  const url = ORIGIN + new URL(req.url).pathname;
  const range = req.headers.get("range");
  const cache = await caches.open(OFFLINE_MEDIA_CACHE);
  const hit = await cache.match(url);
  if (hit) return rangeResponse(hit, range);
  // Not cached yet: fetch the WHOLE file (no Range), keep it, answer the
  // slice. Files are small (≤2 MB), so this is cheaper than partial caching.
  const res = await fetch(url);
  if (!res.ok) return res;
  const blob = await res.blob();
  if (!mediaHashes) await loadManifest(false);
  const known = mediaHashes && mediaHashes[new URL(url).pathname];
  const headers = new Headers({ "Content-Type": res.headers.get("content-type") || blob.type || "application/octet-stream" });
  if (known) headers.set(OFFLINE_HASH_HEADER, known.hash);
  const whole = new Response(blob, { status: 200, headers });
  await cache.put(url, whole.clone());
  return rangeResponse(whole, range);
}

async function cdnResponse(req) {
  const cache = await caches.open(OFFLINE_CDN_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") await cache.put(req.url, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const kind = offlineKind(req.url, ORIGIN);
  if (kind === "shell") event.respondWith(shellResponse(event));
  else if (kind === "media") event.respondWith(mediaResponse(req).catch(() => Response.error()));
  else if (kind === "cdn") event.respondWith(cdnResponse(req).catch(() => Response.error()));
  // api / skip: straight to the network, untouched.
});
