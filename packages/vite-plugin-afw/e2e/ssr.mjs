// Real-browser check of server-rendered pages in the Vite workflow (`tsr test-e2e-vite`):
// build the full-stack fixture with `mode: "ssr"`, start the built Node server, and in
// headless Chrome confirm the client adopts the server's DOM instead of rebuilding it,
// then stays interactive and navigates on the client.
//
// Run with Node: `node packages/vite-plugin-afw/e2e/ssr.mjs`.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createBuilder } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "../node-tests/helpers.mjs";

const chrome = process.env.CHROME_BIN || process.env.CHROMIUM_BIN || "/usr/bin/chromium";
const results = [];
function check(ok, label) {
  results.push([ok, label]);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

// Recorded before any page script runs: nodes removed from the server-rendered #app.
// Adoption keeps every server node; a client rebuild would remove them.
const WATCH_ADOPTION = `
  window.__removed = [];
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.removedNodes) {
      if (n.nodeType === 1 && r.target.closest?.("#app")) window.__removed.push(n.outerHTML.slice(0, 60));
    }
  }).observe(document, { childList: true, subtree: true });
`;

const { dir, cleanup } = await copyFixture("fullstack");
const profile = await mkdtemp(join(tmpdir(), "afw-vite-ssr-chrome-"));
let server, browser, ws;
try {
  await writeFile(join(dir, "vite.config.js"), 'import afw from "@opentf/vite-plugin-afw";\nexport default { plugins: [afw({ mode: "ssr" })] };\n');
  await (await createBuilder({ logLevel: "silent", configFile: false, root: dir, plugins: [afw({ mode: "ssr" })] })).buildApp();
  server = spawn(process.execPath, ["dist/server/index.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  const origin = await new Promise((resolve, reject) => {
    let out = "";
    server.stdout.on("data", (c) => { out += c; const m = out.match(/listening on (http:\/\/\S+)/); if (m) resolve(m[1]); });
    server.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });

  browser = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const devtools = await new Promise((resolve, reject) => {
    let text = "";
    browser.stderr.on("data", (chunk) => { text += chunk; const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) resolve(new URL(m[1])); });
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
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const until = async (expression, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = await evaluate(expression); if (v) return v; await delay(100); }
    return evaluate(expression);
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WATCH_ADOPTION });

  await send("Page.navigate", { url: `${origin}/` });
  check(await until("document.readyState === 'complete' && !!document.getElementById('counter')"), "the server-rendered home page loads");
  await delay(300);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", `hydration adopts the server DOM (removed: ${await evaluate("JSON.stringify(window.__removed)")})`);
  await evaluate("window.__marker = 'kept'; document.getElementById('counter').click()");
  check(await until("document.getElementById('counter').textContent === 'Count 2'"), "the adopted component handles events");

  await evaluate(`document.querySelector('a[href="/todos"]').click()`);
  check(await until("document.querySelectorAll('#todos li').length === 2"), "client navigation renders a loader page");
  check((await evaluate("window.__marker")) === "kept", "client navigation does not reload");

  await send("Page.navigate", { url: `${origin}/todos` });
  check(await until("document.readyState === 'complete' && document.querySelectorAll('#todos li').length === 2"), "a loader page renders on the server");
  await delay(300);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", "the loader page adopts the server DOM");

  check(errors.length === 0, `no browser errors or warnings: ${JSON.stringify(errors)}`);
} catch (error) {
  check(false, `unexpected error: ${error?.stack ?? error}`);
} finally {
  ws?.close();
  browser?.kill();
  server?.kill();
  await cleanup();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
