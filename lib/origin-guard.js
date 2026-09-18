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

const ALLOWED_ORIGIN_HOST = /(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/;

// Origin first, Referer as a fallback (some browsers omit Origin on
// same-origin requests). A missing/unparsable value is refused rather than
// waved through — every real caller has one.
function isAllowedOriginHost(value) {
  if (!value) return false;
  try {
    return ALLOWED_ORIGIN_HOST.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(request) {
  const origin = request?.headers?.get("origin") || request?.headers?.get("referer");
  return isAllowedOriginHost(origin);
}

export { isAllowedOrigin, isAllowedOriginHost, ALLOWED_ORIGIN_HOST };
