// Production + dev server. `@afw/server` is generated from `app/`: it runs the
// middleware around API routes, server functions, loader data and pages, so a new
// route, loader or middleware needs no edit here. What stays yours is how static
// files are served.
import { serve } from "runtime:http";
import { file } from "runtime:fs";
import { env } from "runtime:process";
import * as app from "@afw/server";

// Beside this bundle: `dist/` in production, `.dev/dist/` under `esdev start`.
const outDir = new URL("./", import.meta.url);

// Built assets. Pages are not files: `/` and `*.html` go to the page step. Only a
// regular file is one: `/assets/` names a directory, which goes on to the fallback's
// 404 like any other path that is not a file.
async function files(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/" || pathname.endsWith(".html")) return null;
  const asset = file(new URL(`.${pathname}`, outDir));
  const isFile = await asset.stat().then((stat) => stat.isFile, () => false);
  if (!isFile) return null;
  // The runtime's type for the extension: module scripts are refused without a
  // JavaScript one.
  const type = asset.type || "application/octet-stream";
  return new Response(asset.stream(), { headers: { "content-type": type } });
}

// A static route's page as the build prerendered it (`<path>/index.html`), or null.
async function readStatic(pathname) {
  const page = file(new URL(`.${pathname.replace(/\/?$/, "/")}index.html`, outDir));
  return (await page.exists()) ? page.text() : null;
}

const shell = await file(new URL("./index.html", outDir)).text();
const html = (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

// Pages: rendered per route policy when the app renders any page on the server
// (`app/_config.js`); otherwise every page is the shell and renders in the browser.
const renderPage = app.createPageRenderer
  ? app.createPageRenderer({ shell, readStatic })
  : async (request) => ((request.headers.get("accept") ?? "").includes("text/html") ? html(shell) : null);

const server = serve(
  { port: Number(env.PORT ?? "3000") },
  app.createHandler({
    files,
    renderPage,
    fallback: () => new Response("Not found", { status: 404 }),
  }),
);

console.log(`listening on http://localhost:${(await server.addr).port}`);
