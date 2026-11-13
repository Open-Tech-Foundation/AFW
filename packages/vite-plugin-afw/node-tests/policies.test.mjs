// Per-route render policies (`_config.js`) in the Vite workflow: a mixed app — server by
// default, a static page, a static page behind the middleware, a static dynamic route
// listed by `paths`, and a client section whose page touches `window` when it loads —
// built and served by the Node server, then served by the dev server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { createBuilder, createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const html = { accept: "text/html" };
const exists = (p) => access(p).then(() => true, () => false);
const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "");

async function mixedApp() {
  const app = await copyFixture("fullstack");
  const write = async (rel, source) => {
    await mkdir(join(app.dir, "app", rel, ".."), { recursive: true });
    await writeFile(join(app.dir, "app", rel), source);
  };
  await write("_config.js", 'import { defineRoute } from "@opentf/afw";\nexport default defineRoute({ render: "server" });\n');
  await write("about/_config.js", 'export default { render: "static" };\n');
  await write("about/page.md", "# About\n\nBuilt once, at build time.\n");
  await write("admin/_config.js", 'export default { render: "static" };\n');
  await write("posts/[slug]/_config.js",
    'import { defineRoute } from "@opentf/afw";\nexport default defineRoute({ render: "static", paths: async () => [{ slug: "hello" }] });\n');
  await write("posts/[slug]/page.jsx", 'export default function Post({ params }) { return <h1 id="post">post {params.slug}</h1>; }\n');
  await write("dashboard/_config.js", 'export default { render: "client" };\n');
  // A browser-only dependency: reads `window` as it loads, so a server import would crash.
  await write("dashboard/browser-only.js", 'export const width = window.innerWidth;\nexport const MARK = "DASHBOARD_ONLY_MODULE";\n');
  await write("dashboard/loader.js", 'export default function loader() { return { visits: 42 }; }\n');
  await write("dashboard/page.jsx", `import { router } from "@opentf/afw";
import { MARK, width } from "./browser-only.js";
export default function Dashboard() {
  return <section id="dashboard" data-width={width}>{MARK} {router.data?.visits}</section>;
}
`);
  return app;
}

function startBuiltServer(dir) {
  const child = spawn(process.execPath, ["dist/server/index.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  const origin = new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (c) => { out += c; const m = out.match(/listening on (http:\/\/\S+)/); if (m) resolve(m[1]); });
    child.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
  return { child, origin };
}

describe("a mixed app, built", () => {
  let dir, cleanup, child, origin, logged = "";
  before(async () => {
    ({ dir, cleanup } = await mixedApp());
    process.chdir(dir); // the fixture's loader reads data relative to the working directory
    const log = console.log;
    console.log = (...args) => { logged += `${args.join(" ")}\n`; };
    try {
      await (await createBuilder({ logLevel: "silent", configFile: false, root: dir, plugins: [afw()] })).buildApp();
    } finally {
      console.log = log;
    }
    ({ child, origin } = startBuiltServer(dir));
    origin = await origin;
  });
  after(async () => {
    child?.kill();
    await cleanup?.();
  });

  test("the build prints each route's policy and writes the route manifest", async () => {
    assert.match(logged, /AFW routes\nRoute\s+Render\s+From/);
    assert.match(logged, /\/dashboard\s+client\s+app\/dashboard\/_config\.js/);
    assert.match(logged, /\/about\s+static\s+app\/about\/_config\.js/);
    assert.match(logged, /\/todos\s+server\s+app\/_config\.js/);
    const manifest = JSON.parse(await readFile(join(dir, "dist", "client", "routes.json"), "utf8"));
    assert.equal(manifest.default, "server");
    assert.deepEqual(manifest.routes.find((r) => r.route === "/dashboard"),
      { route: "/dashboard", render: "client", data: "server", page: "app/dashboard/page.jsx", from: "app/dashboard/_config.js" });
  });

  test("static routes are prebuilt, listed dynamic pages included; server and client routes are not", async () => {
    assert.match(await readFile(join(dir, "dist", "client", "about", "index.html"), "utf8"), /Built once, at build time/);
    assert.ok(await exists(join(dir, "dist", "client", "admin", "index.html")));
    assert.match(plain(await readFile(join(dir, "dist", "client", "posts", "hello", "index.html"), "utf8")), /post hello/);
    assert.ok(!(await exists(join(dir, "dist", "client", "todos", "index.html"))));
    assert.ok(!(await exists(join(dir, "dist", "client", "dashboard", "index.html"))));
  });

  test("the client page never enters the server bundle", async () => {
    const files = await readdir(join(dir, "dist", "server"), { recursive: true });
    const server = (await Promise.all(files.filter((f) => f.endsWith(".js")).map((f) => readFile(join(dir, "dist", "server", f), "utf8")))).join("\n");
    assert.doesNotMatch(server, /DASHBOARD_ONLY_MODULE/);
    assert.doesNotMatch(server, /window\.innerWidth/);
  });

  test("each response says how it was produced", async () => {
    const about = await fetch(`${origin}/about`, { headers: html });
    assert.equal(about.status, 200);
    assert.equal(about.headers.get("x-afw-render"), "static");
    assert.match(await about.text(), /Built once, at build time/);
    const todos = await fetch(`${origin}/todos`, { headers: html });
    assert.equal(todos.headers.get("x-afw-render"), "server");
    assert.match(plain(await todos.text()), /write the Vite plugin/);
    const post = await fetch(`${origin}/posts/hello`, { headers: html });
    assert.equal(post.headers.get("x-afw-render"), "static");
  });

  test("an unlisted page of a static dynamic route renders on request", async () => {
    const res = await fetch(`${origin}/posts/other`, { headers: html });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-afw-render"), "static");
    assert.match(plain(await res.text()), /post other/);
  });

  test("a client route sends its server layouts, an empty region and its loader data", async () => {
    const res = await fetch(`${origin}/dashboard`, { headers: html });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-afw-render"), "client");
    const page = await res.text();
    assert.match(page, /data-afw-hydrate="\/dashboard"/);
    assert.match(page, /<nav>/, "the root layout is server-rendered");
    assert.match(page, /<main><!--\[--><!--\]--><\/main>/, "the page's region is left empty");
    assert.doesNotMatch(page, /DASHBOARD_ONLY_MODULE/);
    assert.match(page, /id="__afw_data">\{"visits":42\}/);
  });

  test("the middleware still guards a prebuilt static page", async () => {
    const res = await fetch(`${origin}/admin`, { headers: html, redirect: "manual" });
    assert.equal(res.status, 302);
    const allowed = await fetch(`${origin}/admin`, { headers: { ...html, "x-role": "admin" } });
    assert.equal(allowed.headers.get("x-afw-render"), "static");
  });
});

describe("a mixed app, in the dev server", () => {
  let dir, cleanup, server, origin;
  before(async () => {
    ({ dir, cleanup } = await mixedApp());
    process.chdir(dir);
    server = await createServer({ logLevel: "silent", configFile: false, root: dir, plugins: [afw()], server: { port: 0, host: "127.0.0.1" } });
    await server.listen();
    origin = server.resolvedUrls.local[0].replace(/\/$/, "");
  });
  after(async () => {
    await server?.close();
    await cleanup?.();
  });

  test("each strategy renders as in production: static on request, client as layouts and a region", async () => {
    const about = await fetch(`${origin}/about`, { headers: html });
    assert.equal(about.headers.get("x-afw-render"), "static");
    assert.match(await about.text(), /data-afw-hydrate="\/about"[\s\S]*Built once, at build time/);
    const dashboard = await fetch(`${origin}/dashboard`, { headers: html });
    assert.equal(dashboard.headers.get("x-afw-render"), "client");
    const page = await dashboard.text();
    assert.match(page, /<main><!--\[--><!--\]--><\/main>/);
    assert.match(page, /\/@vite\/client/);
    const todos = await fetch(`${origin}/todos`, { headers: html });
    assert.equal(todos.headers.get("x-afw-render"), "server");
  });

  test("the browser's route table marks the client entries", async () => {
    const code = await (await fetch(`${origin}/entry.js`)).text();
    assert.match(code, /@afw\/routes|\/@id\/__x00__@afw\/routes/);
    const mod = await server.environments.client.transformRequest(`\0@afw/routes:${dir}/app`);
    assert.match(mod.code, /Object\.assign\(\(\) => import\("[^"]*\/app\/dashboard\/page\.jsx"\), \{ __afwClient: true \}\)/);
    assert.doesNotMatch(mod.code, /about\/page\.md"\), \{ __afwClient/);
  });

  test("a config edit that changes a folder's policy applies after the reload", async () => {
    await writeFile(join(dir, "app", "about", "_config.js"), 'export default { render: "server" };\n');
    server.watcher.emit("change", join(dir, "app", "about", "_config.js"));
    let header;
    for (let i = 0; i < 50 && header !== "server"; i++) {
      header = (await fetch(`${origin}/about`, { headers: html })).headers.get("x-afw-render");
      if (header !== "server") await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(header, "server");
  });
});
