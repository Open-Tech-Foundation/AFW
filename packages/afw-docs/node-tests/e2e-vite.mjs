// Real-browser check of a docs site built with the Vite workflow
// (`tsr test-e2e-docs-vite`): build the fixture site, serve it with `vite preview`, and
// in headless Chrome confirm prerendered pages hydrate in place, the sidebar navigates
// on the client, and search finds a page through the index the build wrote.
//
// Run with Node: `node packages/afw-docs/node-tests/e2e-vite.mjs`.

import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { preview } from "vite";

import { copySite, pkg } from "./helpers.mjs";

const chrome = process.env.CHROME_BIN || process.env.CHROMIUM_BIN || "/usr/bin/chromium";
const results = [];
function check(ok, label) {
  results.push([ok, label]);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

// Recorded before any page script runs: nodes removed from the prerendered #app. A
// <Portal> moving its content to <body> is a relocation by design, not a rebuild.
const WATCH_ADOPTION = `
  window.__removed = [];
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.removedNodes) {
      if (n.nodeType === 1 && r.target.closest?.("#app") && !n.hasAttribute("data-afw-portal")) window.__removed.push(n.outerHTML.slice(0, 60));
    }
  }).observe(document, { childList: true, subtree: true });
`;

const { dir, cleanup } = await copySite();
const profile = await mkdtemp(join(tmpdir(), "afw-docs-vite-chrome-"));
let server, browser, ws;
try {
  await promisify(execFile)(process.execPath, [join(pkg, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "error"], { cwd: dir });
  server = await preview({ root: dir, logLevel: "silent", preview: { port: 0, host: "127.0.0.1" } });
  const origin = server.resolvedUrls.local[0].replace(/\/$/, "");

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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WATCH_ADOPTION });

  await send("Page.navigate", { url: `${origin}/docs/getting-started` });
  check(await until("document.readyState === 'complete' && !!document.querySelector('.afwd-sidebar-link')"), "the prerendered docs page loads with its sidebar");
  await delay(400);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", `the page hydrates in place (removed: ${await evaluate("JSON.stringify(window.__removed)")})`);

  await evaluate("window.__marker = 'kept'");
  await evaluate(`[...document.querySelectorAll('.afwd-sidebar-link')].find((a) => a.textContent.includes('Advanced guide')).click()`);
  check(await until("location.pathname === '/docs/guides/advanced' && document.querySelector('h1')?.textContent.includes('Advanced guide')"), "the sidebar navigates on the client");
  check((await evaluate("window.__marker")) === "kept", "sidebar navigation does not reload");
  check(await until(`document.querySelector('.afwd-sidebar-link.afwd-active')?.textContent.includes('Advanced guide')`), "the active sidebar link follows the route");

  await evaluate("document.querySelector('.afwd-search-trigger').click()");
  check(await until("document.querySelector('.afwd-search-modal')?.classList.contains('is-open')"), "the search dialog opens");
  await evaluate(`(() => { const input = document.querySelector('.afwd-search-input-field'); input.value = 'quixotic'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  check(await until(`[...document.querySelectorAll('.afwd-search-result')].some((r) => r.getAttribute('href')?.startsWith('/docs/guides/advanced'))`), "search finds the page through the built index");

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
