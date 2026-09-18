// lib/origin-guard.js — the cheap Origin/Referer filter on the public Vercel
// API routes. It is not a security boundary (see the module's own comment);
// these tests pin the host regex so a future tweak can't accidentally widen
// it to "anything containing vercel.app".
import { test, expect } from "bun:test";

import { isAllowedOrigin, isAllowedOriginHost, matchesExtraHost, parseExtraHosts } from "../lib/origin-guard.js";

test("origin guard allows the deployed/dev hosts and refuses everything else", () => {
  for (const ok of [
    "https://ertegim.vercel.app/",
    "https://ertegim-git-main-user.vercel.app/x",
    "http://localhost:3000",
    "http://127.0.0.1:3000/app",
  ]) expect(isAllowedOriginHost(ok)).toBe(true);

  for (const bad of [
    "https://evil.com/",
    "https://notvercel.app.evil.com/",
    "https://vercel.app.evil.com/",
    "https://myvercel.app/", // must not match without a dot boundary
    "not a url",
    "",
    null,
    undefined,
  ]) expect(isAllowedOriginHost(bad)).toBe(false);
});

test("origin guard reads Origin first, then Referer, and refuses when both are absent", () => {
  const req = (h) => ({ headers: new Headers(h) });
  // isAllowedOrigin is the Request-shaped wrapper around the host check.
  expect(isAllowedOrigin(req({ origin: "https://x.vercel.app" }))).toBe(true);
  expect(isAllowedOrigin(req({ referer: "https://x.vercel.app/page" }))).toBe(true);
  expect(isAllowedOrigin(req({ origin: "https://evil.com", referer: "https://x.vercel.app" }))).toBe(false);
  expect(isAllowedOrigin(req({}))).toBe(false);
});

test("ALLOWED_ORIGIN_EXTRA adds exact hosts and, with a leading dot, subdomains", () => {
  const hosts = parseExtraHosts(" ertegim.kz , *.demo.kz ,, ");
  expect(hosts).toEqual(["ertegim.kz", ".demo.kz"]);
  expect(matchesExtraHost("ertegim.kz", hosts)).toBe(true);
  expect(matchesExtraHost("ERTEGIM.KZ", hosts)).toBe(true);
  // Exact entries do NOT open up subdomains, and nothing matches by substring.
  expect(matchesExtraHost("evil-ertegim.kz", hosts)).toBe(false);
  expect(matchesExtraHost("www.ertegim.kz", hosts)).toBe(false);
  // Dotted entries cover the bare host and its subdomains.
  expect(matchesExtraHost("demo.kz", hosts)).toBe(true);
  expect(matchesExtraHost("a.demo.kz", hosts)).toBe(true);
  expect(matchesExtraHost("notdemo.kz", hosts)).toBe(false);
  // Unset env var = no extra hosts at all.
  expect(parseExtraHosts(undefined)).toEqual([]);
  expect(matchesExtraHost("ertegim.kz", [])).toBe(false);
});
