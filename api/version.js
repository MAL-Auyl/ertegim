// Vercel Edge Function — which build is deployed. The therapist's cabinet
// shows it next to the error log, so a pilot report («the fox froze at the
// apple») can be matched to the exact commit. Vercel injects the commit
// into every function's environment; nothing secret is returned.
export const config = { runtime: "edge" };

export default function handler() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  return new Response(JSON.stringify({
    version: sha ? sha.slice(0, 7) : "dev",
    env: process.env.VERCEL_ENV || "unknown",
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
