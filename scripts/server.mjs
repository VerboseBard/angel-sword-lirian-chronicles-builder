import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  [".webmanifest", "application/manifest+json; charset=utf-8"],
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

function sendJson(response, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(body);
}

function corsHeaders(request) {
  return {
    "access-control-allow-origin": request.headers.origin || "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-allow-private-network": "true",
    "vary": "origin"
  };
}

function readRequestBody(request, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const RELAY_BOOT = `${Date.now().toString(36)}-${process.pid}`;
const relayEvents = [];
let relaySeq = 0;

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
  if (pathname === "/api/vtt-relay/events" && request.method === "POST") {
    let event;
    try {
      event = JSON.parse(await readRequestBody(request, 3000000));
    } catch {
      return sendJson(response, 400, { ok: false, message: "Relay events must be JSON." }, corsHeaders(request));
    }
    if (!event || typeof event !== "object" || !event.id) {
      return sendJson(response, 400, { ok: false, message: "Relay events need an id." }, corsHeaders(request));
    }
    relaySeq += 1;
    relayEvents.push({ seq: relaySeq, event });
    if (relayEvents.length > 200) {
      relayEvents.shift();
    }
    return sendJson(response, 200, { ok: true, boot: RELAY_BOOT, seq: relaySeq }, corsHeaders(request));
  }

  if (pathname === "/api/vtt-relay/events") {
    const query = new URL(request.url, `http://${request.headers.host || `${HOST}:${START_PORT}`}`).searchParams;
    const since = query.get("boot") === RELAY_BOOT ? Number(query.get("since")) || 0 : 0;
    const events = relayEvents.filter((entry) => entry.seq > since).map((entry) => entry.event);
    return sendJson(response, 200, { ok: true, boot: RELAY_BOOT, seq: relaySeq, events }, corsHeaders(request));
  }

  if (pathname === "/api/status") {
    return sendJson(response, 200, {
      ok: true,
      mode: "local-server",
      projectRoot: PROJECT_ROOT,
      campaignPrototype: true,
      message: "Beta 2.13 public build local development server is connected."
    });
  }

  return sendJson(response, 404, { ok: false, message: "Unknown local API endpoint." });
}

async function serveStatic(request, response, pathname) {
  const cors = /^\/owlbear(\/|$)/i.test(pathname) ? corsHeaders(request) : {};
  const absolute = safeStaticPath(pathname);
  if (!absolute) {
    return sendJson(response, 403, { ok: false, message: "Forbidden path." }, cors);
  }

  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    return sendJson(response, 404, { ok: false, message: "File not found." }, cors);
  }

  if (stat.isDirectory()) {
    return serveStatic(request, response, `${pathname.replace(/\/$/, "")}/index.html`);
  }

  const type = MIME_TYPES.get(path.extname(absolute).toLowerCase()) || "application/octet-stream";
  const relativePath = path.relative(PROJECT_ROOT, absolute).replace(/\\/g, "/");
  if (relativePath === "owlbear/manifest.json") {
    try {
      const manifest = JSON.parse(await fs.readFile(absolute, "utf8"));
      const base = `http://${request.headers.host || `${HOST}:${START_PORT}`}/owlbear/`;
      const absolutize = (value) => (typeof value === "string" && value ? new URL(value, base).href : value);
      manifest.icon = absolutize(manifest.icon);
      manifest.background_url = absolutize(manifest.background_url);
      if (manifest.action) {
        manifest.action.icon = absolutize(manifest.action.icon);
        manifest.action.popover = absolutize(manifest.action.popover);
      }
      return sendJson(response, 200, manifest, cors);
    } catch {
      // Serve the raw file if the manifest is temporarily unparseable.
    }
  }
  const isNoStore = /^(?:assets\/versions\/manifest\.(?:js|json)|owlbear\/manifest\.json|assets\/app\.bundle\.js(?:\.map)?|owlbear\/dist\/[^/]+\.js|owlbear\/[^/]+\.js)$/i.test(relativePath);
  const headers = {
    "content-type": type,
    "cache-control": type.includes("text/html") || isNoStore
      ? "no-store"
      : "public, max-age=60",
    ...cors
  };
  response.writeHead(200, headers);
  createReadStream(absolute).pipe(response);
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${START_PORT}`}`);
      console.log(`[req] ${request.method} ${url.pathname}${request.headers.referer ? ` (from ${request.headers.referer})` : ""}${request.headers["sec-fetch-dest"] ? ` dest=${request.headers["sec-fetch-dest"]}` : ""}`);
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders(request));
        response.end();
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url.pathname);
        return;
      }
      await serveStatic(request, response, url.pathname);
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

function listenOnPort(server, port, host = HOST) {
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
    server.listen(port, host);
  });
}

async function start() {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = START_PORT + offset;
    const server = createServer();
    try {
      await listenOnPort(server, port);
      if (HOST === "127.0.0.1") {
        const ipv6Loopback = createServer();
        try {
          await listenOnPort(ipv6Loopback, port, "::1");
        } catch {
          ipv6Loopback.close();
        }
      }
      const displayHost = HOST === "127.0.0.1" ? "localhost" : HOST;
      const url = `http://${displayHost}:${port}/`;
      console.log(`Lyrian Beta 2.13 public build running at ${url}`);
      console.log(`Owlbear local install link: http://localhost:${port}/owlbear/manifest.json`);
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
