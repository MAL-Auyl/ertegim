const { test, expect, describe } = require("bun:test");
const fs = require("fs");
const path = require("path");
const O = require("../public/offline.js");
const { buildManifest } = require("../tools/offline-manifest.js");

const ORIGIN = "https://ertegim.example";

describe("offline manifest", () => {
  test("public/offline-manifest.json is up to date (run: node tools/offline-manifest.js)", () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/offline-manifest.json"), "utf8"));
    expect(onDisk).toEqual(buildManifest());
  });
  test("covers every page, every lesson line and every lesson picture", () => {
    const m = buildManifest();
    for (const p of ["/", "/index.html", "/story.html", "/cabinet.html", "/app.js", "/offline.js", "/homework.js"]) expect(m.shell).toContain(p);
    expect(m.shell).not.toContain("/sw.js");
    const urls = m.media.map((f) => f.url);
    const audio = fs.readdirSync(path.join(__dirname, "../public/audio")).filter((n) => n.endsWith(".wav"));
    for (const a of audio) expect(urls).toContain("/audio/" + a);
    for (const svg of fs.readdirSync(path.join(__dirname, "../public/images/lesson-a"))) expect(urls).toContain("/images/lesson-a/" + svg);
    for (const f of m.media) {
      expect(f.hash).toMatch(/^[0-9a-f]{12}$/);
      expect(f.bytes).toBeGreaterThan(0);
    }
  });
  test("every shell file exists", () => {
    for (const u of buildManifest().shell) {
      if (u === "/") continue;
      expect(fs.existsSync(path.join(__dirname, "../public", u)), u).toBe(true);
    }
  });
});

describe("request routing", () => {
  test("offlineKind", () => {
    expect(O.offlineKind("/api/transcribe", ORIGIN)).toBe("api");
    expect(O.offlineKind("/sw.js", ORIGIN)).toBe("skip");
    expect(O.offlineKind("/story.html?lesson=letter-a", ORIGIN)).toBe("shell");
    expect(O.offlineKind("/", ORIGIN)).toBe("shell");
    expect(O.offlineKind("/app.js", ORIGIN)).toBe("shell");
    expect(O.offlineKind("/audio/a_intro.wav", ORIGIN)).toBe("media");
    expect(O.offlineKind("/images/fox_clip2.webm", ORIGIN)).toBe("media");
    expect(O.offlineKind("/images/lesson-a/alma.svg", ORIGIN)).toBe("media");
    expect(O.offlineKind("https://fonts.gstatic.com/s/nunito/x.woff2", ORIGIN)).toBe("cdn");
    expect(O.offlineKind("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js", ORIGIN)).toBe("cdn");
    expect(O.offlineKind("https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.2/rive.js", ORIGIN)).toBe("skip");
    expect(O.offlineKind("https://api.groq.com/x", ORIGIN)).toBe("skip");
  });
  test("shellKey drops the query and maps / to index.html", () => {
    expect(O.shellKey("/story.html?lesson=letter-a", ORIGIN)).toBe(ORIGIN + "/story.html");
    expect(O.shellKey("/", ORIGIN)).toBe(ORIGIN + "/index.html");
    expect(O.shellKey(ORIGIN + "/cabinet.html#x", ORIGIN)).toBe(ORIGIN + "/cabinet.html");
  });
});

describe("range responses (Safari media from cache)", () => {
  test("parseRange", () => {
    expect(O.parseRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(O.parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(O.parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(O.parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(O.parseRange("bytes=200-", 100)).toBeNull();
    expect(O.parseRange("bytes=5-2", 100)).toBeNull();
    expect(O.parseRange("bytes=-", 100)).toBeNull();
    expect(O.parseRange("items=0-1", 100)).toBeNull();
    expect(O.parseRange("bytes=0-1", 0)).toBeNull();
  });
  test("rangeResponse slices a cached file into a 206", async () => {
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const whole = () => new Response(body, { headers: { "content-type": "audio/wav" } });
    const r = await O.rangeResponse(whole(), "bytes=2-4");
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([2, 3, 4]);
    const full = await O.rangeResponse(whole(), null);
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect((await full.arrayBuffer()).byteLength).toBe(10);
  });
});

describe("download plan", () => {
  const manifest = { media: [
    { url: "/audio/a.wav", bytes: 100, hash: "aaa" },
    { url: "/images/fox_clip2.webm", bytes: 10, hash: "w" },
    { url: "/images/fox_clip2.mp4", bytes: 20, hash: "m" },
    { url: "/images/fox_idle_test.mp4", bytes: 30, hash: "i" },
  ] };
  test("one video format per device", () => {
    expect(O.mediaForDevice(manifest.media, true).map((f) => f.url)).toEqual(["/audio/a.wav", "/images/fox_clip2.webm", "/images/fox_idle_test.mp4"]);
    expect(O.mediaForDevice(manifest.media, false).map((f) => f.url)).toEqual(["/audio/a.wav", "/images/fox_clip2.mp4", "/images/fox_idle_test.mp4"]);
  });
  test("missing and changed files are to do, matching ones are done", () => {
    const p = O.offlinePlan(manifest, { "/audio/a.wav": "OLD", "/images/fox_clip2.webm": "w" }, true);
    expect(p.todo.map((f) => f.url)).toEqual(["/audio/a.wav", "/images/fox_idle_test.mp4"]);
    expect(p.bytes).toBe(140);
    expect(p.doneBytes).toBe(10);
    expect(p.ready).toBe(false);
    const all = O.offlinePlan(manifest, { "/audio/a.wav": "aaa", "/images/fox_clip2.webm": "w", "/images/fox_idle_test.mp4": "i" }, true);
    expect(all.ready).toBe(true);
    expect(O.offlinePlan({ media: [] }, {}).ready).toBe(false);
  });
});
