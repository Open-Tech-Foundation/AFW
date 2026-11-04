// Real-browser check of the Vite workflow's dev loop (`tsr test-e2e-vite`): Vite's dev
// server on a copy of the full-stack fixture, driven in headless Chrome over CDP. Covers
// first render, events, client navigation, loader data served by Node, and in-place
// refresh of a component, a page and a layout.
//
// Run with Node: `node packages/vite-plugin-afw/e2e/dev.mjs`. Chrome comes from
// CHROME_BIN / CHROMIUM_BIN, else /usr/bin/chromium.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "../node-tests/helpers.mjs";

const chrome = process.env.CHROME_BIN || process.env.CHROMIUM_BIN || "/usr/bin/chromium";
const results = [];
function check(ok, label) {
  results.push([ok, label]);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

const { dir, cleanup } = await copyFixture("fullstack");
process.chdir(dir); // the fixture's loader reads data relative to the working directory
const profile = await mkdtemp(join(tmpdir(), "afw-vite-chrome-"));
let server, browser, ws;
try {
  server = await createServer({ logLevel: "silent", configFile: false, root: dir, plugins: [afw()], server: { port: 0, strictPort: false } });
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, "");

  browser = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const devtools = await new Promise((resolve, reject) => {
    let text = "";
    browser.stderr.on("data", (chunk) => {
      text += chunk;
      const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) resolve(new URL(m[1]));
    });
    browser.once("exit", (code) => reject(new Error(`Chrome exited (${code}): ${chrome}`)));
  });
  const targets = await (await fetch(`http://${devtools.host}/json`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const until = async (expression, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = await evaluate(expression); if (v) return v; await delay(100); }
    return evaluate(expression);
  };
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`);

  await send("Runtime.enable");
  await send("Page.navigate", { url: `${origin}/` });
  check(await until("document.getElementById('title')?.textContent === 'Home on Vite'"), "the home page renders");
  check((await text("#badge")) === "FROM TSX", "a TypeScript component renders");
  await evaluate("window.__marker = 'kept'; document.getElementById('counter').click()");
  check(await until("document.getElementById('counter').textContent === 'Count 2'"), "a component handles events");

  await evaluate(`document.querySelector('a[href="/about"]').click()`);
  check(await until("document.querySelector('main h1')?.textContent === 'About'"), "client navigation renders the Markdown page");
  check((await evaluate("window.__marker")) === "kept", "client navigation does not reload");
  await evaluate(`document.querySelector('a[href="/todos"]').click()`);
  check(await until("document.querySelectorAll('#todos li').length === 2"), "client navigation fetches loader data from the Node server");
  check((await evaluate("window.__marker")) === "kept", "the loader-data navigation does not reload");

  // Server functions: the page imported stubs; calling them reaches Node.
  check(JSON.stringify(await evaluate("__todosFns.listTodos({ prefix: 'test' })")) === JSON.stringify({ todos: ["test it on Node"], via: "middleware" }),
    "a server function query runs on Node with the middleware's locals");
  check((await evaluate("__todosFns.addTodo({ title: 'x' }).then((r) => r.added)")) === "x", "a server function action posts and returns its result");
  check((await evaluate("__todosFns.addTodo({}).catch((e) => e.name + ' ' + e.status)")) === "ServerFunctionError 422",
    "a refused action rejects with a ServerFunctionError and its status");
  const fnsFile = join(dir, "app", "todos", "todos.server.js");
  await writeFile(fnsFile, (await readFile(fnsFile, "utf8")).replace("return { added: title,", "return { added: title.toUpperCase(),"));
  check(await until("__todosFns.addTodo({ title: 'y' }).then((r) => r.added === 'Y')"), "an edited server function answers without a restart");
  check((await evaluate("window.__marker")) === "kept", "calling server functions does not reload");
  await evaluate(`document.querySelector('a[href="/"]').click()`);
  await until("document.getElementById('counter')");
  await evaluate("document.getElementById('counter').click()");

  const counterFile = join(dir, "app", "Counter.jsx");
  const counterSource = await readFile(counterFile, "utf8");
  await writeFile(counterFile, counterSource.replace("Count {count}", "Clicks {count}"));
  check(await until("document.getElementById('counter')?.textContent === 'Clicks 2'"), "a component edit refreshes in place and keeps its state");
  check((await evaluate("window.__marker")) === "kept", "the component edit does not reload");

  const pageFile = join(dir, "app", "page.jsx");
  await writeFile(pageFile, (await readFile(pageFile, "utf8")).replace("Home on Vite", "Home edited"));
  check(await until("document.getElementById('title')?.textContent === 'Home edited'"), "a page edit refreshes in place");
  check((await text("#counter")) === "Clicks 2", `the page edit keeps the state of the components it renders (${await text("#counter")})`);
  check((await evaluate("window.__marker")) === "kept", "the page edit does not reload");

  const layoutFile = join(dir, "app", "layout.jsx");
  await writeFile(layoutFile, (await readFile(layoutFile, "utf8")).replace(">About<", ">About us<"));
  check(await until(`document.querySelector('a[href="/about"]')?.textContent === 'About us'`), "a layout edit refreshes in place");
  check((await text("#title")) === "Home edited", "the layout edit keeps the page");
  check((await evaluate("window.__marker")) === "kept", "the layout edit does not reload");

  check(errors.length === 0, `no browser errors: ${JSON.stringify(errors)}`);
} catch (error) {
  check(false, `unexpected error: ${error?.stack ?? error}`);
} finally {
  ws?.close();
  browser?.kill();
  await server?.close();
  await cleanup();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
