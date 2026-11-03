import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { createBuilder, preview } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const exists = (p) => access(p).then(() => true, () => false);
const html = { accept: "text/html" };

async function buildApp(dir, options) {
  process.chdir(dir); // the fixture's loader reads data relative to the working directory
  await (await createBuilder({ logLevel: "silent", configFile: false, root: dir, plugins: [afw(options)] })).buildApp();
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

describe("mode: ssr", () => {
  let dir, cleanup, server, origin;
  before(async () => {
    ({ dir, cleanup } = await copyFixture("fullstack"));
    await writeFile(join(dir, "app", "404.jsx"), "export default function NotFound() { return <h1 id=\"missing\">Nothing here</h1>; }");
    await buildApp(dir, { mode: "ssr", baseUrl: "https://example.test" });
    ({ child: server, origin } = startBuiltServer(dir));
    origin = await origin;
  });
  after(async () => {
    server?.kill();
    await cleanup?.();
  });

  test("renders pages on the server, marked for hydration", async () => {
    const res = await fetch(`${origin}/`, { headers: html });
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /<div id="app" data-afw-hydrate="\/">/);
    assert.match(page, /<h1 id="title">Home on Vite<\/h1>/);
    assert.match(page, /<button id="counter"[^>]*>/);
    assert.match(page, /<span id="badge">(?:<!--\$-->)?FROM TSX/);
  });

  test("runs the loader with the request and middleware locals, and inlines its data", async () => {
    const page = await (await fetch(`${origin}/todos`, { headers: html })).text();
    assert.match(page, /<li><!--\$-->write the Vite plugin<!--\/--><\/li>/);
    assert.match(page, /id="__afw_data">\{"todos":\["write the Vite plugin","test it on Node"\],"via":"middleware"\}/);
  });

  test("an unknown page renders the 404 page with status 404", async () => {
    const res = await fetch(`${origin}/nope`, { headers: html });
    assert.equal(res.status, 404);
    const page = await res.text();
    assert.match(page, /Nothing here/);
    assert.match(page, /noindex/);
  });

  test("the middleware still guards rendered pages, and API routes still answer", async () => {
    assert.equal((await fetch(`${origin}/admin`, { headers: html, redirect: "manual" })).status, 302);
    assert.equal((await (await fetch(`${origin}/api/hello?name=x`)).json()).hello, "x");
  });

  test("serves built assets but never the raw shell", async () => {
    const page = await (await fetch(`${origin}/`, { headers: html })).text();
    const script = page.match(/src="(\/assets\/[^"]+\.js)"/)[1];
    assert.equal((await fetch(`${origin}${script}`)).status, 200);
    assert.equal((await fetch(`${origin}/index.html`)).status, 404);
  });

  test("the client hydrates rather than rebuilding", async () => {
    const assets = await (await import("node:fs/promises")).readdir(join(dir, "dist", "client", "assets"));
    const js = (await Promise.all(assets.filter((f) => f.endsWith(".js")).map((f) => readFile(join(dir, "dist", "client", "assets", f), "utf8")))).join("\n");
    assert.match(js, /hydrateAt/);
  });
});

describe("mode: ssg", () => {
  test("a site without server files becomes static files in dist/", async () => {
    const { dir, cleanup } = await copyFixture("spa");
    try {
      await buildApp(dir, { mode: "ssg", baseUrl: "https://example.test" });
      const about = await readFile(join(dir, "dist", "about", "index.html"), "utf8");
      assert.match(about, /<div id="app" data-afw-hydrate="\/about">/);
      assert.match(about, /Rendered from <strong>Markdown<\/strong>/);
      assert.match(await readFile(join(dir, "dist", "sitemap.xml"), "utf8"), /<loc>https:\/\/example\.test\/about<\/loc>/);
      assert.match(await readFile(join(dir, "dist", "robots.txt"), "utf8"), /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
      assert.ok(!(await exists(join(dir, "dist", "server"))));
      assert.ok(!(await exists(join(dir, "node_modules", ".afw-ssg"))), "the render bundle is removed");
    } finally {
      await cleanup();
    }
  });

  test("vite preview serves prerendered pages at their clean URLs, and 404 for unknown ones", async () => {
    const { dir, cleanup } = await copyFixture("spa");
    let server;
    try {
      await buildApp(dir, { mode: "ssg" });
      server = await preview({ root: dir, logLevel: "silent", configFile: false, plugins: [afw({ mode: "ssg" })], preview: { port: 0, host: "127.0.0.1" } });
      const origin = server.resolvedUrls.local[0].replace(/\/$/, "");
      for (const url of ["/about", "/about/"]) {
        const res = await fetch(`${origin}${url}`, { headers: html });
        assert.equal(res.status, 200, url);
        assert.match(await res.text(), /data-afw-hydrate="\/about"/, url);
      }
      assert.match(await (await fetch(`${origin}/`, { headers: html })).text(), /data-afw-hydrate="\/"/);
      assert.equal((await fetch(`${origin}/nope`, { headers: html })).status, 404);
      assert.equal((await fetch(`${origin}/robots.txt`)).status, 200);
    } finally {
      await server?.close();
      await cleanup();
    }
  });

  test("a full-stack site prerenders into dist/client and ships the server", async () => {
    const { dir, cleanup } = await copyFixture("fullstack");
    let child;
    try {
      await buildApp(dir, { mode: "ssg" });
      assert.match(await readFile(join(dir, "dist", "client", "todos", "index.html"), "utf8"), /write the Vite plugin/);
      assert.ok(await exists(join(dir, "dist", "client", "todos", "__data.json")));
      let origin;
      ({ child, origin } = startBuiltServer(dir));
      origin = await origin;
      assert.match(await (await fetch(`${origin}/todos`, { headers: html })).text(), /<ul id="todos">/);
      assert.equal((await (await fetch(`${origin}/api/hello?name=ssg`)).json()).hello, "ssg");
      assert.equal((await fetch(`${origin}/nope`, { headers: html })).status, 404);
    } finally {
      child?.kill();
      await cleanup();
    }
  });

  test("a failing prerender fails the build", async () => {
    const { dir, cleanup } = await copyFixture("fullstack");
    try {
      await writeFile(join(dir, "app", "todos", "loader.js"), 'import { notFound } from "@opentf/afw/server";\nexport default () => notFound();\n');
      await assert.rejects(buildApp(dir, { mode: "ssg" }), /prerender failed for \/todos/);
    } finally {
      await cleanup();
    }
  });
});

describe("i18n", () => {
  const i18n = { locales: ["en", "fr"], defaultLocale: "en" };
  // The client entry needs the same locales, so hydration resolves the same route.
  const localize = (dir) => writeFile(join(dir, "entry.js"),
    'import { mountApp } from "@opentf/afw";\nimport { guard, loaderRoutes, pages } from "@afw/routes";\n' +
    `mountApp({ pages, guard, loaders: loaderRoutes, i18n: ${JSON.stringify(i18n)}, target: document.getElementById("app") });\n`);

  test("ssg prerenders every page per locale, with lang and hreflang alternates", async () => {
    const { dir, cleanup } = await copyFixture("spa");
    try {
      await localize(dir);
      await buildApp(dir, { mode: "ssg", i18n, baseUrl: "https://example.test" });
      const fr = await readFile(join(dir, "dist", "fr", "about", "index.html"), "utf8");
      assert.match(fr, /<html lang="fr">/);
      assert.match(fr, /data-afw-hydrate="\/fr\/about"/);
      assert.match(fr, /hreflang="en"[^>]*href="[^"]*\/about"|href="[^"]*\/about"[^>]*hreflang="en"/);
      assert.match(fr, /hreflang="x-default"/);
      assert.match(await readFile(join(dir, "dist", "about", "index.html"), "utf8"), /<html lang="en">/);
      assert.ok(await exists(join(dir, "dist", "fr", "index.html")));
      assert.match(await readFile(join(dir, "dist", "sitemap.xml"), "utf8"), /https:\/\/example\.test\/fr\/about/);
    } finally {
      await cleanup();
    }
  });

  test("ssr renders a locale-prefixed request in that locale", async () => {
    const { dir, cleanup } = await copyFixture("fullstack");
    let child;
    try {
      await localize(dir);
      await buildApp(dir, { mode: "ssr", i18n });
      let origin;
      ({ child, origin } = startBuiltServer(dir));
      origin = await origin;
      const fr = await fetch(`${origin}/fr/todos`, { headers: html });
      assert.equal(fr.status, 200);
      const page = await fr.text();
      assert.match(page, /<html lang="fr">/);
      assert.match(page, /data-afw-hydrate="\/fr\/todos"/);
      assert.match(page, /write the Vite plugin/, "the loader runs for the localized URL");
      assert.match(await (await fetch(`${origin}/todos`, { headers: html })).text(), /<html lang="en">/);
    } finally {
      child?.kill();
      await cleanup();
    }
  });
});

