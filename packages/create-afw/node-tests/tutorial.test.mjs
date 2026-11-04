// The website's tutorial (docs/getting-started/tutorial), run as written: scaffold
// with its command's flags, write every code block labelled with a file path, then
// test, build and run the app the way the tutorial says. A tutorial that drifts from
// the framework fails here.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { startVitest } from "vitest/node";

import { create, parseArgs } from "@opentf/create-afw";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(dirname(pkg));
const TUTORIAL = join(repo, "website", "app", "docs", "getting-started", "tutorial", "page.mdx");
let page, root, scratch;

before(async () => {
  page = await readFile(TUTORIAL, "utf8");
  await mkdir(join(pkg, ".cache"), { recursive: true });
  scratch = await mkdtemp(join(pkg, ".cache", "tutorial-"));
  root = join(scratch, "my-notes");
});
after(() => rm(scratch, { recursive: true, force: true }));

// ```lang path/to/file\n…``` blocks.
const fileBlocks = (mdx) => [...mdx.matchAll(/```\w+ ([\w./-]+)\n([\s\S]*?)```/g)].map(([, path, code]) => ({ path, code }));

test("the tutorial's create command scaffolds the app it builds on", async () => {
  const command = page.match(/npm create @opentf\/afw@latest (\S+) -- ([^\n]+)/);
  assert.ok(command, "the create command is in the tutorial");
  const options = parseArgs([command[1], ...command[2].trim().split(/\s+/)]);
  const server = options.render === "ssr" || !!options.server; // SSR always has a server, as main() resolves it
  assert.deepEqual([options.template, options.render, server, options.language], ["app", "ssr", true, "js"]);
  await create({ directory: root, template: options.template, render: options.render, server, language: options.language });
  // The layout the tutorial replaces is the starter's, plus the Notes link.
  const layout = fileBlocks(page).find((b) => b.path === "app/layout.jsx").code;
  assert.equal(layout.replace('        <Link href="/notes">Notes</Link>\n', ""), await readFile(join(root, "app", "layout.jsx"), "utf8"));
  for (const { path, code } of fileBlocks(page)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), code);
  }
});

test("its tests pass (npm test)", async () => {
  const vitest = await startVitest("test", [], { root, run: true, watch: false, reporters: [] });
  try {
    const files = vitest.state.getFiles();
    assert.deepEqual(files.flatMap((f) => f.result?.errors ?? []).map((e) => e.message), []);
    assert.deepEqual(files.flatMap((f) => f.tasks).map((t) => `${t.name}: ${t.result?.state}`).sort(), [
      "counts clicks: pass",
      "saves the typed note and clears the input: pass",
      "shows the server's validation message: pass",
    ]);
  } finally {
    await vitest.close();
  }
});

test("it builds and runs as the tutorial describes (npm run build, npm start)", async () => {
  await promisify(execFile)(process.execPath, [join(pkg, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "error"], { cwd: root });
  const child = spawn(process.execPath, ["dist/server/index.js"], { cwd: root, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  try {
    const url = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (c) => { out += c; const m = out.match(/listening on (http:\/\/\S+)/); if (m) resolve(m[1]); });
      child.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
    });
    const html = await (await fetch(`${url}/notes`, { headers: { accept: "text/html" } })).text();
    assert.match(html, /Read the AFW docs/, "the notes are in the server-rendered HTML");
    assert.match(html, /<h1[^>]*>Notes<\/h1>/);

    const assets = join(root, "dist", "client", "assets");
    const code = (await Promise.all((await readdir(assets)).filter((f) => f.endsWith(".js")).map((f) => readFile(join(assets, f), "utf8")))).join("\n");
    assert.doesNotMatch(code, /In memory for the tutorial/, "the server module stays on the server");
    const endpoints = [...new Set(code.match(/\/notes\/__fn\/[0-9a-f]{16}/g) ?? [])];
    assert.ok(endpoints.length >= 2, "the page calls addNote and deleteNote");
    const call = (endpoint, v) => fetch(`${url}${endpoint}`, { method: "POST", headers: { origin: url, "content-type": "application/json" }, body: JSON.stringify({ v }) });

    // An empty note is refused by the schema, with its message.
    const refused = await Promise.all(endpoints.map(async (e) => { const r = await call(e, { text: "   " }); return r.status === 400 ? (await r.json()).error.issues : null; }));
    assert.ok(refused.some((issues) => issues?.[0]?.message === "Write something first"), JSON.stringify(refused));
    // A real one is added, and the page's loader data has it.
    const added = await Promise.all(endpoints.map(async (e) => { const r = await call(e, { text: "Buy milk" }); return r.status === 200 ? (await r.json()).v : null; }));
    assert.ok(added.some((note) => note?.text === "Buy milk"), JSON.stringify(added));
    const data = await (await fetch(`${url}/notes/__data.json`)).json();
    assert.deepEqual(data.notes.map((n) => n.text), ["Read the AFW docs", "Buy milk"]);
  } finally {
    child.kill();
  }
});
