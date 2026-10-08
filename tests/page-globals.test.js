// Classic <script>s on one page share one global scope: two files declaring
// the same top-level const/function make the second one fail to load (a
// SyntaxError for const/let) — the whole page breaks with no visible error.
// Every page's own script list is read from its HTML and checked here.
const { test, expect } = require("bun:test");
const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "../public");
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));

for (const page of pages) {
  test(`${page}: no two scripts declare the same top-level name`, () => {
    const html = fs.readFileSync(path.join(PUB, page), "utf8");
    const files = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
    const seen = new Map();
    for (const f of files) {
      const src = fs.readFileSync(path.join(PUB, f.replace(/^\//, "")), "utf8");
      for (const m of src.matchAll(/^(?:const|let|var|function|async function|class) ([A-Za-z_$][\w$]*)/gm)) {
        const name = m[1];
        expect(seen.has(name) ? `${name}: ${seen.get(name)} and ${f}` : null).toBeNull();
        seen.set(name, f);
      }
    }
  });
}
