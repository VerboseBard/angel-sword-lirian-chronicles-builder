import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverOfficialVersions, planVersionUpdate, readLocalManifest } from "./update-lyrian-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.LYRIAN_PROJECT_ROOT ? path.resolve(process.env.LYRIAN_PROJECT_ROOT) : path.resolve(__dirname, "..");
const HOST = process.env.LYRIAN_HOST || "127.0.0.1";
const START_PORT = Number(process.env.LYRIAN_PORT || 4176);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".mp3", "audio/mpeg"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function sendJson(response, status, data) {
  const body = JSON.stringify(data, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized === "/" ? "index.html" : normalized.replace(/^[/\\]+/, "");
  const absolute = path.resolve(PROJECT_ROOT, relative);
  const rootBoundary = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : `${PROJECT_ROOT}${path.sep}`;
  if (absolute !== PROJECT_ROOT && !absolute.startsWith(rootBoundary)) {
    return "";
  }
  return absolute;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/status") {
    return sendJson(response, 200, {
      ok: true,
      mode: "local-server",
      projectRoot: PROJECT_ROOT,
      campaignPrototype: true,
      message: "Beta 1.5 local development server is connected."
    });
  }

  if (pathname === "/api/versions/local") {
    const manifest = await readLocalManifest(PROJECT_ROOT);
    return sendJson(response, 200, { ok: true, manifest });
  }

  if (pathname === "/api/versions/check") {
    const manifest = await readLocalManifest(PROJECT_ROOT);
    const official = await discoverOfficialVersions({ manualUrl: manifest.officialManualUrl });
    const localLatest = manifest.latestKnownVersion || manifest.defaultVersion || "";
    return sendJson(response, 200, {
      ...official,
      localLatest,
      hasUpdate: official.latestVersion ? compareVersionStrings(official.latestVersion, localLatest) > 0 : false
    });
  }

  if (pathname === "/api/versions/download" && request.method === "POST") {
    const raw = await readRequestBody(request);
    const body = raw ? JSON.parse(raw) : {};
    const result = await planVersionUpdate(PROJECT_ROOT, body.version);
    return sendJson(response, result.ok ? 200 : 501, result);
  }

  return sendJson(response, 404, { ok: false, message: "Unknown local API endpoint." });
}

function compareVersionStrings(a, b) {
  const left = String(a || "").match(/\d+/g)?.map(Number) || [];
  const right = String(b || "").match(/\d+/g)?.map(Number) || [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}

async function serveStatic(response, pathname) {
  const absolute = safeStaticPath(pathname);
  if (!absolute) {
    return sendJson(response, 403, { ok: false, message: "Forbidden path." });
  }

  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    return sendJson(response, 404, { ok: false, message: "File not found." });
  }

  if (stat.isDirectory()) {
    return serveStatic(response, `${pathname.replace(/\/$/, "")}/index.html`);
  }

  const type = MIME_TYPES.get(path.extname(absolute).toLowerCase()) || "application/octet-stream";
  const relativePath = path.relative(PROJECT_ROOT, absolute).replace(/\\/g, "/");
  const isMutableVersionManifest = /^assets\/versions\/manifest\.(?:js|json)$/i.test(relativePath);
  response.writeHead(200, {
    "content-type": type,
    "cache-control": type.includes("text/html") || isMutableVersionManifest
      ? "no-store"
      : "public, max-age=60"
  });
  createReadStream(absolute).pipe(response);
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${START_PORT}`}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url.pathname);
        return;
      }
      await serveStatic(response, url.pathname);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error?.message || "Local server error."
      });
    }
  });
}

function openBrowser(url) {
  if (process.env.LYRIAN_NO_OPEN === "1") {
    return;
  }
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], { windowsHide: true });
    return;
  }
  if (process.platform === "darwin") {
    execFile("open", [url]);
    return;
  }
  execFile("xdg-open", [url]);
}

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

async function start() {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = START_PORT + offset;
    const server = createServer();
    try {
      await listenOnPort(server, port);
      const url = `http://${HOST}:${port}/`;
      console.log(`Lyrian Beta 1.5 running at ${url}`);
      console.log("Close this terminal window to stop the local development server.");
      openBrowser(url);
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        throw error;
      }
    }
  }
  throw new Error(`No available local port found from ${START_PORT} to ${START_PORT + 19}.`);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
