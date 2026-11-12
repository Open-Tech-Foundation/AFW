// The production Node server for the Vite workflow: `vite build` emits
// `dist/server/index.js`, which calls `startServer` with the built app. Every request
// runs the app's middleware; API routes and loader data answer first, then built
// files from `dist/client`, then pages: the app shell (spa), prerendered files (ssg)
// or a server render (ssr).
//
//   node dist/server/index.js            # PORT and HOST from the environment
//
// For a custom server, import `createHandler` (and, for ssr, `createPageRenderer`)
// from `dist/server/app.js`; the handler is a plain Fetch handler.

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { stampHydrateSentinel } from "@opentf/afw-build/document";
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

const notFound = () => new Response("Not Found", { status: 404 });

function clientRoot(clientDir) {
  return normalize(typeof clientDir === "string" ? clientDir : fileURLToPath(clientDir));
}

/**
 * A `files` step: a built file from `clientDir` for `GET`/`HEAD`, or `null` to pass.
 * Hashed `/assets/*` are cached for a year. With `html: false` (server-rendered
 * pages), HTML files are left to the page renderer — the raw shell is never served.
 */
export function staticFiles(clientDir, { html = true } = {}) {
  const root = clientRoot(clientDir);
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return null;
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return notFound();
    if (!html && extname(file).toLowerCase() === ".html") return null;
    const immutable = pathname.startsWith("/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {};
    return (await fileResponse(file, method, immutable)) ?? (html ? await fileResponse(join(file, "index.html"), method) : null);
  };
}

/**
 * A `readStatic` for `createPageRenderer`: the HTML the build prerendered for a static
 * route (`<clientDir>/<path>/index.html`), or null. The renderer serves it inside the
 * middleware chain, so a folder's `_middleware` still guards its static pages.
 */
export function prerenderedPages(clientDir) {
  const root = clientRoot(clientDir);
  return async (pathname) => {
    let path;
    try {
      path = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const file = normalize(join(root, path, "index.html"));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
    return readFile(file, "utf8").catch(() => null);
  };
}

const wantsHtml = (request) =>
  ["GET", "HEAD"].includes(request.method.toUpperCase()) && (request.headers.get("accept") ?? "").includes("text/html");

/**
 * The fallback for an SPA: built files, else `index.html` for page navigations
 * (`GET`/`HEAD` asking for HTML), else 404.
 */
export function staticFallback(clientDir) {
  const files = staticFiles(clientDir);
  const root = clientRoot(clientDir);
  return async (request) => {
    const found = await files(request);
    if (found) return found;
    if (wantsHtml(request)) {
      const shell = await fileResponse(join(root, "index.html"), request.method.toUpperCase(), { "cache-control": "no-cache" });
      if (shell) return shell;
    }
    return notFound();
  };
}

/** A prerendered site's fallback: its `404.html` (status 404) for page navigations. */
function notFoundPage(clientDir) {
  const root = clientRoot(clientDir);
  return async (request) => {
    if (wantsHtml(request)) {
      const page = await fileResponse(join(root, "404.html"), request.method.toUpperCase());
      if (page) return new Response(page.body, { status: 404, headers: page.headers });
    }
    return notFound();
  };
}

/**
 * Start the app on Node. `app` is the built `@afw/server` module; `clientDir` the
 * built client (`dist/client`). `mode` picks how pages are served: `spa` (the app
 * shell), `ssg` (prerendered files, `404.html`) or `ssr` (rendered per request).
 * Resolves to the listening `http.Server`.
 */
export async function startServer({
  app, createHandler = app?.createHandler, clientDir, mode = "spa", baseUrl = "",
  port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "0.0.0.0",
} = {}) {
  let handler;
  if (mode === "ssr") {
    if (typeof app?.createPageRenderer !== "function") throw new Error("startServer: mode \"ssr\" needs an app built with pages");
    const shell = stampHydrateSentinel(await readFile(join(clientRoot(clientDir), "index.html"), "utf8"));
    handler = createHandler({
      files: staticFiles(clientDir, { html: false }),
      renderPage: app.createPageRenderer({ shell, baseUrl, readStatic: prerenderedPages(clientDir) }),
      fallback: notFound,
    });
  } else if (mode === "ssg") {
    handler = createHandler({ files: staticFiles(clientDir), fallback: notFoundPage(clientDir) });
  } else {
    handler = createHandler({ fallback: staticFallback(clientDir) });
  }
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
