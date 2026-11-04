// Browser e2e for the navbar on small screens without a sidebar (navbar-menu.mjs):
// the links leave the bar for a menu, nothing overflows the viewport, and wide
// screens keep the inline links. Built like mobile-drawer.mjs, whose notes follow.
//
// Browser e2e for the mobile sidebar drawer — the half the `--dom` unit tests
// (tests/MobileDrawer.test.js) can't cover, because it depends on real CSS: the
// off-canvas transform, the 768px breakpoint, the slide-in, the backdrop, and the
// body-scroll lock.
//
// It is self-contained: it builds a tiny harness (drawer-harness.js — just <Sidebar> +
// <SidebarToggle>) with the afwc build plugin, serves it with the real theme CSS, and
// drives headless Chromium over the DevTools Protocol. No `afw build` of the website,
// no external deps — a static HTTP server + a ~40-line CDP client over a WebSocket.
//
//   esdev packages/afw-docs/tests/e2e/mobile-drawer.mjs
//
// Needs the workspace afwc debug build (../../../../target/debug/afwc) and Chromium
// (override with CHROME_BIN). Exits 0 if every assertion holds, 1 otherwise.

import { build } from "runtime:build";
import { exists, file } from "runtime:fs";
import { serve } from "runtime:http";
import { dirname, fromFileURL, join } from "runtime:path";
import { env } from "runtime:process";
import { Command } from "runtime:system";

const HERE = dirname(fromFileURL(import.meta.url));
const ROOT = dirname(dirname(dirname(dirname(HERE))));
const AFWC = env.AFWC_BIN || join(ROOT, "target/debug/afwc");
const THEME_CSS = join(ROOT, "packages/afw-docs/theme/index.css");
const ENTRY = join(HERE, "navbar-harness.js");
const CHROME = env.CHROME_BIN || "/usr/bin/chromium";
const MOBILE = { width: 390, height: 800, deviceScaleFactor: 1, mobile: true };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };

if (!(await exists(AFWC))) {
  console.error(`✗ no afwc at ${AFWC} (run \`cargo build\` for the compiler first)`);
  throw new Error("afwc is required");
}

let passed = 0;
const ok = (label) => (passed++, console.log(`  ✓ ${label}`));
function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
  ok(label);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Build the harness bundle (afwc compiles the .jsx imports) ────────────────
const afwPlugin = {
  name: "afw-jsx",
  transform: { filter: { id: /\.[jt]sx$/ }, handler: async (code, id) => {
    const proc = await new Command(AFWC, { args: ["build", "--component", "--stdin", id], stdin: code }).output();
    if (!proc.success) throw new Error(`afwc failed for ${id}:\n${new TextDecoder().decode(proc.stderr)}`);
    return { code: new TextDecoder().decode(proc.stdout), type: "js" };
  } },
};

const bundle = await build({ input: ENTRY, platform: "browser", plugins: [afwPlugin] });
const { output } = await bundle.generate({ format: "esm" });
const bundleJS = output.find((entry) => entry.type === "chunk" && entry.isEntry)?.code;
if (!bundleJS) throw new Error("no browser entry chunk produced");
const themeCSS = await file(THEME_CSS).text();
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${themeCSS}</style></head>
<body><script type="module">${bundleJS}</script></body></html>`;

// ── Serve it ──────────────────────────────────────────────────────────────────
const server = serve({ hostname: "127.0.0.1", port: 0 }, () => new Response(html, { headers: { "content-type": "text/html" } }));
const origin = `http://127.0.0.1:${(await server.addr).port}`;

// ── Minimal CDP client (page-target WebSocket; no session plumbing) ───────────
async function fetchJSON(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`timed out fetching ${url}`);
}

const port = 9000 + Math.floor(Math.random() * 1000);
const chrome = new Command(CHROME, {
  args: ["--headless=new", `--remote-debugging-port=${port}`, "--no-sandbox",
    "--disable-gpu", "--hide-scrollbars", "about:blank"],
  stdout: "null",
  stderr: "null",
}).spawn();

async function connectPage() {
  const targets = await fetchJSON(`http://127.0.0.1:${port}/json`);
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
        console.error("  [page error]", msg.params.args.map((a) => a.value || a.description).join(" "));
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].res(msg.params);
      }
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const m = ++id;
      pending.set(m, { res, rej });
      ws.send(JSON.stringify({ id: m, method, params }));
    });
  const once = (method) => new Promise((res) => waiters.push({ method, res }));
  return { send, once, close: () => ws.close() };
}

async function evalJS(client, expression) {
  const r = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.text} in ${expression}`);
  return r.result.value;
}

// Poll the geometry/style PROBE until `predicate(snapshot)` holds, then return that snapshot.
// Replaces the fixed settle sleeps: an open/close CSS transition (and a viewport media-query
// switch) advances over frames, so we wait for the *end state* the assertions check rather
// than guessing the animation's duration — headless still advances the transition over time.
async function waitForProbe(client, predicate, label, { timeout = 6000, interval = 40 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await evalJS(client, PROBE);
    if (predicate(s)) return s;
    if (Date.now() > deadline) throw new Error(`timed out (${timeout}ms) waiting for ${label}`);
    await sleep(interval);
  }
}

// What the assertions read, in-page.
const PROBE = `(() => {
  const r = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, visible: getComputedStyle(el).display !== "none" && b.width > 0 }; };
  const menu = document.querySelector("#afw-navbar-menu");
  return {
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    brand: r(".afwd-navbar-brand"), nav: r(".afwd-navbar-nav"), toggle: r(".afwd-navbar-menu-toggle"), theme: r(".afwd-theme-toggle, .afwd-navbar-actions > :last-child"),
    menuLinks: menu ? [...menu.querySelectorAll("a")].map((a) => a.textContent) : null,
    menuBox: menu ? (() => { const b = menu.getBoundingClientRect(); return { left: b.left, right: b.right }; })() : null,
  };
})()`;

const client = await connectPage();
let failure = null;
try {
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", MOBILE);
  await client.send("Page.navigate", { url: origin });
  let s = await waitForProbe(client, (p) => p.toggle !== null, "the navbar to mount");

  s = await waitForProbe(client, (p) => p.toggle.visible, "the mobile layout");
  assert(s.scrollWidth <= s.width, `mobile: nothing overflows the viewport (${s.scrollWidth} ≤ ${s.width})`);
  assert(!s.nav.visible, "mobile: the inline links leave the bar");
  assert(s.toggle.right <= s.width && s.brand.left >= 0, "mobile: the brand and the menu button are on screen");
  assert(s.brand.right < s.toggle.left, "mobile: the brand is not overlapped");

  await evalJS(client, `document.querySelector(".afwd-navbar-menu-toggle").click()`);
  s = await waitForProbe(client, (p) => p.menuLinks !== null, "the menu to open");
  assert(s.menuLinks.join(",") === "Home,Docs,Packages,API", "mobile: the menu lists the top-level links");
  assert(s.menuBox.left >= 0 && s.menuBox.right <= s.width, "mobile: the menu fits the viewport");

  await evalJS(client, `document.documentElement.setAttribute("data-afw-has-sidebar", "")`);
  s = await waitForProbe(client, (p) => !p.toggle.visible, "the menu button to hide when a sidebar exists");
  ok("mobile with a sidebar: the drawer holds the links, so no menu button");
  await evalJS(client, `document.documentElement.removeAttribute("data-afw-has-sidebar")`);

  await client.send("Emulation.setDeviceMetricsOverride", DESKTOP);
  s = await waitForProbe(client, (p) => p.nav.visible, "the desktop layout");
  assert(!s.toggle.visible, "desktop: no menu button");
  assert(s.menuLinks === null || !(await evalJS(client, `getComputedStyle(document.querySelector("#afw-navbar-menu")).display !== "none"`)), "desktop: the menu never shows");
} catch (e) {
  failure = e;
} finally {
  client.close();
  (await chrome).kill();
  await server.stop();
}
if (failure) {
  console.error(`✗ ${failure.message}`);
  throw failure;
}
console.log(`navbar menu: ${passed} checks passed`);
