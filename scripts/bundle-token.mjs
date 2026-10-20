// Task 038 item 16 (03xb audit): the index.html cache-buster for the app
// bundle is derived from the bundle's own content, so it changes exactly when
// the bundle changes. scripts/build-app.mjs writes it; test-032 checks that
// index.html carries the token of the bundle on disk.
//
// The hash ignores line endings (CRLF -> LF): git checks the bundle out with
// CRLF on this machine while esbuild writes LF, and both are the same code.
import { createHash } from "node:crypto";

export const BUNDLE_TOKEN_PREFIX = "b-";
const BUNDLE_SRC_PATTERN = /(assets\/app\.bundle\.js)\?v=([^"'\s>]+)/;

export function bundleTokenFor(bundleText) {
  const normalized = String(bundleText).replace(/\r\n/g, "\n");
  return `${BUNDLE_TOKEN_PREFIX}${createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16)}`;
}

export function readBundleToken(indexHtml) {
  return BUNDLE_SRC_PATTERN.exec(String(indexHtml))?.[2] || "";
}

export function writeBundleToken(indexHtml, token) {
  const html = String(indexHtml);
  if (!BUNDLE_SRC_PATTERN.test(html)) {
    throw new Error("index.html has no assets/app.bundle.js?v=... script tag to update.");
  }
  return html.replace(BUNDLE_SRC_PATTERN, `$1?v=${token}`);
}
