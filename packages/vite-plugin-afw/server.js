// The production Node server for the Vite workflow: `vite build` emits
// `dist/server/index.js`, which calls `startServer` with the app's composed handler.
// Every request runs the app's middleware; API routes and loader data answer first,
// then built files from `dist/client`, then the app shell for page navigations.
//
//   node dist/server/index.js            # PORT and HOST from the environment
//
// For a custom server, import `createHandler` from `dist/server/app.js` and pass
// `fallback: staticFallback(clientDir)`; the handler is a plain Fetch handler.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { toNodeListener } from "@opentf/afw/server/adapters/node";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

async function fileResponse(path, method, headers = {}) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  const head = {
    "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(info.size),
    ...headers,
  };
  if (method === "HEAD") return new Response(null, { status: 200, headers: head });
  return new Response(Readable.toWeb(createReadStream(path)), { status: 200, headers: head });
}

/**
 * The fallback for requests the app's server routes don't answer: a built file from
 * `clientDir` (hashed `/assets/*` cached for a year), else `index.html` for page
 * navigations (`GET`/`HEAD` asking for HTML), else 404.
 */
export function staticFallback(clientDir) {
  const root = normalize(typeof clientDir === "string" ? clientDir : fileURLToPath(clientDir));
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return new Response("Not Found", { status: 404 });
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return new Response("Not Found", { status: 404 });
    }
    const immutable = pathname.startsWith("/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {};
    const found = (await fileResponse(file, method, immutable)) ?? (await fileResponse(join(file, "index.html"), method));
    if (found) return found;
    if ((request.headers.get("accept") ?? "").includes("text/html")) {
      const shell = await fileResponse(join(root, "index.html"), method, { "cache-control": "no-cache" });
      if (shell) return shell;
    }
    return new Response("Not Found", { status: 404 });
  };
}

/**
 * Start the app on Node. `createHandler` is the `@afw/server` export; `clientDir` the
 * built client (`dist/client`). Resolves to the listening `http.Server`.
 */
export function startServer({
  createHandler, clientDir, port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "0.0.0.0",
} = {}) {
  const handler = createHandler({ fallback: staticFallback(clientDir) });
  const server = createServer(toNodeListener(handler));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      console.log(`AFW server listening on http://${host === "0.0.0.0" ? "localhost" : host}:${address.port}`);
      resolve(server);
    });
  });
}
