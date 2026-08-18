import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyClosure } from "../src/verify-closure.mjs";
import {
  presentEvaluation,
  presentParseError,
} from "./presentation.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const MAX_BODY_BYTES = 1024 * 1024;
const PUBLIC_DIRECTORY = fileURLToPath(new URL("./public/", import.meta.url));
const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

function sendJson(response, status, value) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": CONTENT_TYPES[".json"],
  });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("Request body exceeds 1 MiB.");
        error.code = "REQUEST_BODY_TOO_LARGE";
        reject(error);
        return;
      }
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function evaluateRequest(request, response) {
  let raw;
  try {
    raw = await readBody(request);
  } catch (error) {
    if (error.code === "REQUEST_BODY_TOO_LARGE") {
      sendJson(response, 413, {
        runner_state: "PARSE_ERROR",
        presentation: presentParseError(error.code, error.message),
      });
      return;
    }
    throw error;
  }

  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch (error) {
    sendJson(response, 400, {
      runner_state: "PARSE_ERROR",
      presentation: presentParseError("MALFORMED_JSON", error.message),
    });
    return;
  }

  const evaluation = verifyClosure(bundle);
  sendJson(response, 200, {
    evaluation,
    presentation: presentEvaluation(bundle, evaluation),
  });
}

function safeAssetPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = resolve(PUBLIC_DIRECTORY, relative);
  if (
    resolved !== resolve(PUBLIC_DIRECTORY) &&
    !resolved.startsWith(`${resolve(PUBLIC_DIRECTORY)}${sep}`)
  ) {
    return null;
  }
  return resolved;
}

function isTraversalAttempt(rawUrl) {
  const rawPath = rawUrl.split("?")[0];
  try {
    const decoded = decodeURIComponent(rawPath);
    return decoded.includes("\0") || decoded.split("/").includes("..");
  } catch {
    return true;
  }
}

async function serveAsset(request, response, pathname) {
  const assetPath = safeAssetPath(pathname);
  if (!assetPath) {
    sendJson(response, 400, {
      runner_state: "REQUEST_ERROR",
      error: { code: "INVALID_ASSET_PATH" },
    });
    return;
  }
  try {
    const info = await stat(assetPath);
    if (!info.isFile()) throw new Error("Not a file");
  } catch {
    sendJson(response, 404, {
      runner_state: "REQUEST_ERROR",
      error: { code: "NOT_FOUND" },
    });
    return;
  }
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Length": String((await stat(assetPath)).size),
    "Content-Type": CONTENT_TYPES[extname(assetPath)] ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(assetPath).pipe(response);
}

export function createInspectorServer() {
  return createServer(async (request, response) => {
    try {
      const rawUrl = request.url ?? "/";
      if (isTraversalAttempt(rawUrl)) {
        sendJson(response, 400, {
          runner_state: "REQUEST_ERROR",
          error: { code: "INVALID_ASSET_PATH" },
        });
        return;
      }
      const url = new URL(rawUrl, `http://${HOST}`);
      if (request.method === "GET" && url.pathname === "/api/capabilities") {
        sendJson(response, 200, {
          local_evaluation: true,
          upload_limit_bytes: MAX_BODY_BYTES,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/evaluate") {
        const contentType = String(request.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (contentType !== "application/json") {
          sendJson(response, 415, {
            runner_state: "REQUEST_ERROR",
            error: { code: "UNSUPPORTED_MEDIA_TYPE" },
          });
          return;
        }
        await evaluateRequest(request, response);
        return;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        await serveAsset(request, response, url.pathname);
        return;
      }
      sendJson(response, 405, {
        runner_state: "REQUEST_ERROR",
        error: { code: "METHOD_NOT_ALLOWED" },
      });
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, {
          runner_state: "REQUEST_ERROR",
          error: { code: "INTERNAL_SERVER_ERROR" },
        });
      } else {
        response.end();
      }
    }
  });
}

export function startInspectorServer({ port = DEFAULT_PORT, log = true } = {}) {
  const server = createInspectorServer();
  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      const address = server.address();
      const url = `http://${HOST}:${address.port}`;
      if (log) {
        console.log("RISU Agent Closure Inspector");
        console.log(`Local URL: ${url}`);
        console.log("Runs locally. Evidence does not leave this machine.");
      }
      resolveStart({ server, url, host: HOST, port: address.port });
    });
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  const requestedPort = Number.parseInt(
    process.env.RISU_INSPECTOR_PORT ?? String(DEFAULT_PORT),
    10,
  );
  await startInspectorServer({
    port: Number.isSafeInteger(requestedPort) ? requestedPort : DEFAULT_PORT,
  });
}
