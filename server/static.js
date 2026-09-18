// Map a request path to a file under public/. Decodes percent-encoding
// (asset names may be non-ASCII) and refuses anything that escapes root.
import { normalize, join, sep } from "node:path";

function safeStaticPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded === "") decoded = "/index.html";
  const full = normalize(join(root, decoded));
  const rootNorm = normalize(root + sep);
  if (!full.startsWith(rootNorm)) return null;
  return full;
}

export { safeStaticPath };
