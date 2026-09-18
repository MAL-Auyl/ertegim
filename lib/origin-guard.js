// Origin guard for the public Vercel API routes.
//
// The repo is public, so /api/transcribe and /api/classify's URLs are
// visible to anyone reading it, and both call out to the shared Groq key
// with no auth or rate limiting — a bare script hitting them repeatedly
// right before the pitch could burn the quota the live demo needs.
//
// This is NOT a real security boundary: an Origin header is trivially
// spoofed by a non-browser client. It is a cheap filter against naive and
// accidental hits, and it costs real traffic nothing, because the app's own
// fetch() always sends a same-origin Origin header on POST.
//
// Deliberately NOT used on server/server.js: that is the local dev server,
// not internet-facing, it already has its own loopback guard for the lab
// routes, and the local static app posts same-origin anyway.
//
// Plain ESM, no platform APIs — it only reads headers off a Web Request.
//
// ALLOWED_ORIGIN_EXTRA (optional env var, comma-separated) adds hostnames on
// top of the built-in list, e.g. ALLOWED_ORIGIN_EXTRA="ertegim.kz,www.ertegim.kz".
// A leading dot or "*." means "this host and any subdomain"
// (".ertegim.kz" matches ertegim.kz and demo.ertegim.kz). Without it, moving
// the demo to a custom domain would silently 403 every API call.

const ALLOWED_ORIGIN_HOST = /(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/;

// Each entry becomes an exact hostname match, or a suffix match when written
// with a leading dot / "*." — never a substring match.
function parseExtraHosts(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\*/, ""))
    .filter(Boolean);
}

const EXTRA_ORIGIN_HOSTS = parseExtraHosts(
  typeof process !== "undefined" ? process.env?.ALLOWED_ORIGIN_EXTRA : "",
);

function matchesExtraHost(hostname, hosts = EXTRA_ORIGIN_HOSTS) {
  const h = String(hostname ?? "").toLowerCase();
  return hosts.some((entry) =>
    entry.startsWith(".") ? h === entry.slice(1) || h.endsWith(entry) : h === entry,
  );
}

// Origin first, Referer as a fallback (some browsers omit Origin on
// same-origin requests). A missing/unparsable value is refused rather than
// waved through — every real caller has one.
function isAllowedOriginHost(value) {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return ALLOWED_ORIGIN_HOST.test(hostname) || matchesExtraHost(hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(request) {
  const origin = request?.headers?.get("origin") || request?.headers?.get("referer");
  return isAllowedOriginHost(origin);
}

export {
  isAllowedOrigin,
  isAllowedOriginHost,
  matchesExtraHost,
  parseExtraHosts,
  ALLOWED_ORIGIN_HOST,
  EXTRA_ORIGIN_HOSTS,
};
