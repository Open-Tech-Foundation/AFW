import assert from "node:assert/strict";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

let server, dir, cleanup;
before(async () => {
  ({ dir, cleanup } = await copyFixture("spa"));
  server = await createServer({
    logLevel: "silent", configFile: false, root: dir, plugins: [afw()],
    server: { middlewareMode: true, hmr: false, watch: { usePolling: false } },
  });
});
after(async () => {
  await server?.close();
  await cleanup?.();
});

const routesModule = async () => {
  const resolved = await server.pluginContainer.resolveId("@afw/routes", join(dir, "entry.js"));
  return (await server.transformRequest(resolved.id)).code;
};

test("dev modules compile to hot-refreshable CSR that Vite treats as boundaries", async () => {
  const page = await server.transformRequest("/app/page.jsx");
  assert.match(page.code, /registerHotRoute\(import\.meta\.hot/);
  assert.match(page.code, /import\.meta\.hot\.accept\(\)/);
  const counter = await server.transformRequest("/app/Counter.jsx");
  assert.match(counter.code, /registerHotModule\(import\.meta\.hot/);
  assert.ok(counter.map, "source map");
});

test("@afw/routes lists the app's pages, drafts included in dev", async () => {
  await writeFile(join(dir, "app", "about", "page.md"), "---\ndraft: true\n---\n# Draft\n");
  const code = await routesModule();
  assert.match(code, /"\/app\/page\.jsx"/);
  assert.match(code, /"\/app\/about\/page\.md"/);
  assert.match(code, /export const loaderRoutes = \[\];/);
});

test("adding a route file invalidates the route table and reloads the page", async () => {
  const sent = [];
  const send = server.ws.send;
  server.ws.send = (payload) => sent.push(payload);
  try {
    await routesModule();
    const file = join(dir, "app", "contact", "page.jsx");
    await mkdir(join(dir, "app", "contact"), { recursive: true });
    await writeFile(file, "export default function Contact() { return <p>Contact</p>; }");
    server.watcher.emit("add", file);
    // (Vite's own watcher may report the same file too; every message is a reload.)
    assert.ok(sent.length >= 1);
    assert.ok(sent.every((m) => m.type === "full-reload"), JSON.stringify(sent));
    assert.match(await routesModule(), /"\/app\/contact\/page\.jsx"/);
    await rm(join(dir, "app", "contact"), { recursive: true });
    server.watcher.emit("unlink", file);
    assert.doesNotMatch(await routesModule(), /contact/);
    // Other files leave the route table alone.
    const before = sent.length;
    server.watcher.emit("add", join(dir, "app", "Button.jsx"));
    server.watcher.emit("add", join(dir, "outside", "page.jsx"));
    assert.equal(sent.length, before);
  } finally {
    server.ws.send = send;
  }
});

test("a compile error is reported through Vite with its position", async () => {
  await writeFile(join(dir, "app", "Broken.jsx"), "export default function Broken() {\n  return <p>;\n}\n");
  await assert.rejects(server.transformRequest("/app/Broken.jsx"), (e) => {
    assert.match(e.id ?? e.loc?.file ?? "", /Broken\.jsx/);
    assert.ok(e.loc?.line >= 2, `line ${e.loc?.line}`);
    assert.match(e.frame ?? "", /return <p>/);
    return true;
  });
});
