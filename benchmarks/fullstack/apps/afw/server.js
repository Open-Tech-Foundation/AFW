// The esdev workflow's server target: the generated handler, the built assets, the shell.
import { serve } from "runtime:http";
import { file } from "runtime:fs";
import { env } from "runtime:process";
import { createHandler, createPageRenderer } from "@afw/server";

const outDir = new URL("./", import.meta.url);
const TYPES = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", map: "application/json" };
async function files(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/" || pathname.endsWith(".html")) return null;
  const asset = file(new URL(`.${pathname}`, outDir));
  if (!(await asset.exists())) return null;
  return new Response(asset.stream(), { headers: { "content-type": TYPES[pathname.split(".").pop()] ?? "application/octet-stream" } });
}
const shell = await file(new URL("./index.html", outDir)).text();
const handle = createHandler({ files, renderPage: createPageRenderer({ shell }), fallback: () => new Response("Not Found", { status: 404 }) });
const server = serve({ hostname: "127.0.0.1", port: Number(env.PORT ?? "3000") }, handle);
console.log(`listening on http://127.0.0.1:${(await server.addr).port}`);
