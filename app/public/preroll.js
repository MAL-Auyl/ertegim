// Pre-roll assembly for the VAD recorder. MediaRecorder's first timeslice
// chunk carries the container header (WebM EBML / fMP4 init segment), so
// any clip we build must start with chunks[0]; everything else is a plain
// media cluster and can be dropped or kept freely. Pure array logic so it
// can be unit-tested without a browser.

function assembleClip(chunks, speechIdx, preRollChunks) {
  if (!chunks.length) return [];
  const from = Math.max(1, speechIdx - preRollChunks);
  return [chunks[0], ...chunks.slice(from)];
}

// While the child is still silent the buffer would grow without bound —
// keep only the header plus the last `preRollChunks` clusters.
function trimIdle(chunks, preRollChunks) {
  if (chunks.length <= 1 + preRollChunks) return chunks;
  return [chunks[0], ...chunks.slice(chunks.length - preRollChunks)];
}

if (typeof module !== "undefined") {
  module.exports = { assembleClip, trimIdle };
}
