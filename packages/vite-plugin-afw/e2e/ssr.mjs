// Real-browser check of server-rendered pages in the Vite workflow (`tsr test-e2e-vite`):
// build the full-stack fixture with `mode: "ssr"`, start the built Node server, and in
// headless Chrome confirm the client adopts the server's DOM instead of rebuilding it,
// then stays interactive and navigates on the client.
//
// Run with Node: `node packages/vite-plugin-afw/e2e/ssr.mjs`.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  // A <Pending> page: the server renders its fallback, the client adopts it, then reveals.
  await mkdir(join(dir, "app/pending"), { recursive: true });
  await writeFile(join(dir, "app/pending/page.jsx"), `import { Pending, resource } from "@opentf/afw";
export default function PendingPage() {
  const status = resource(() => new Promise((resolve) => setTimeout(() => resolve("ready"), 400)));
  return (
    <Pending fallback={<p id="skeleton">Loading…</p>}>
      <p id="status">{status.data}</p>
    </Pending>
  );
}
`);
  // loading.jsx / error.jsx: a loader that fails, one that is slow, and links to both.
  const page = async (path, source) => {
    await mkdir(join(dir, "app", path, ".."), { recursive: true });
    await writeFile(join(dir, "app", path), source);
  };
  await page("broken/loader.js", `export default function loader() { throw new Error("db password is hunter2"); }\n`);
  await page("broken/page.jsx", `export default function Broken() { return <p id="broken-page">never</p>; }\n`);
  await page("broken/error.jsx", `export default function BrokenError({ error, retry }) {
  return <p id="route-error" data-status={error.status} onclick={retry}>{error.message}</p>;
}
`);
  await page("slow/loader.js", `export default async function loader() { await new Promise((r) => setTimeout(r, 900)); return { ok: "loaded" }; }\n`);
  await page("slow/loading.jsx", `export default function SlowLoading() { return <p id="slow-loading">Loading slow…</p>; }\n`);
  await page("slow/page.jsx", `import { router } from "@opentf/afw";
export default function Slow() { return <p id="slow-page">{router.data?.ok}</p>; }
`);
  await page("links/page.jsx", `import { Link } from "@opentf/afw";
export default function Links() { return <nav><Link href="/slow">slow</Link> <Link href="/broken">broken</Link></nav>; }
`);
  // Layout loaders: one feeding a shell and two pages (one without a loader of its own),
  // and one that fails under an error.jsx above it.
  await page("shell/layout.jsx", `import { Link, router } from "@opentf/afw";
export default function Shell({ children }) {
  return <div><aside id="shell-user">{router.data?.user}</aside><Link href="/shell/settings">settings</Link>{children}</div>;
}
`);
  await page("shell/layout.loader.js", `export default function loader() { return { user: "ada", plan: "pro" }; }\n`);
  await page("shell/page.jsx", `import { router } from "@opentf/afw";
export default function ShellHome() { return <p id="shell-page">{router.data?.page} {router.data?.plan}</p>; }
`);
  await page("shell/loader.js", `export default function loader() { return { page: "home" }; }\n`);
  await page("shell/settings/page.jsx", `import { router } from "@opentf/afw";
export default function Settings() { return <p id="settings-page">settings for {router.data?.user}</p>; }
`);
  await page("team/error.jsx", `export default function TeamError({ error }) { return <p id="team-error">{error.message}</p>; }\n`);
  await page("team/x/layout.jsx", `export default function X({ children }) { return <div id="x-shell">{children}</div>; }\n`);
  await page("team/x/layout.loader.js", `export default function loader() { throw new Error("team service down"); }\n`);
  await page("team/x/page.jsx", `export default function XPage() { return <p id="x-page">never</p>; }\n`);
  // Route groups and optional segments: a (shop) group with its own layout and
  // middleware, a [[lang]] page and a [[...filters]] page.
  await page("(shop)/layout.jsx", `import { Link } from "@opentf/afw";
export default function ShopShell({ children }) { return <div id="shop-shell"><Link href="/cart">cart</Link>{children}</div>; }
`);
  await page("(shop)/_middleware.js", `export default async function middleware(request, context, next) {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("x-group", "shop");
  return new Response(response.body, { status: response.status, headers });
}
`);
  await page("(shop)/catalog/page.jsx", `export default function Catalog() { return <p id="catalog">catalog</p>; }\n`);
  await page("(shop)/cart/page.jsx", `export default function Cart() { return <p id="cart">cart</p>; }\n`);
  await page("[[lang]]/guide/page.jsx", `export default function Guide({ params }) { return <p id="guide">guide {params.lang ?? "en"}</p>; }\n`);
  // A lazy component: shown on demand, inline when server-rendered.
  await page("lazy/LazyMap.jsx", `export default function LazyMap({ city }) { return <p id="lazy-map">map of {city}</p>; }\n`);
  await page("lazy/page.jsx", `import { Pending } from "@opentf/afw";
const LazyMap = () => import("./LazyMap.jsx");
const Inline = () => import("./LazyMap.jsx").then((m) => m.default);
export default function LazyPage() {
  let open = $state(false);
  return (
    <div>
      <button id="open-map" onclick={() => (open = true)}>Open</button>
      <div id="inline-wrap"><Inline city="Lyon" /></div>
      {open && <Pending fallback={<p id="map-loading">Loading…</p>}><LazyMap city="Paris" /></Pending>}
    </div>
  );
}
`);
  await page("browse/[[...filters]]/page.jsx", `export default function Browse({ params }) { return <p id="browse">{(params.filters ?? ["all"]).join("+")}</p>; }\n`);
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

  const html = await (await fetch(`${origin}/pending`)).text();
  check(html.includes('<template shadowrootmode="open">') && html.includes('id="skeleton"'), "a <Pending> page renders its fallback on the server");
  await send("Page.navigate", { url: `${origin}/pending` });
  const shows = (id) => `(document.getElementById('${id}')?.getClientRects().length ?? 0) > 0`;
  check(await until(`document.readyState === 'complete' && ${shows("skeleton")} && !${shows("status")}`), "the server fallback is displayed while the resource loads");
  check(await until(`${shows("status")} && document.getElementById('status').textContent === 'ready' && !${shows("skeleton")}`), "the content is revealed once the resource resolves");
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", `the <Pending> page adopts the server DOM, fallback included (removed: ${await evaluate("JSON.stringify(window.__removed)")})`);

  // error.jsx on the server: a failed loader renders it with status 500, without the
  // loader's message (production), and the client adopts it.
  const broken = await fetch(`${origin}/broken`);
  const brokenHtml = await broken.text();
  check(broken.status === 500 && brokenHtml.includes('id="route-error"'), `a failed loader renders error.jsx with status 500 (got ${broken.status})`);
  check(brokenHtml.includes("Something went wrong") && !brokenHtml.includes("hunter2"), "the server error page hides the loader's message");
  await send("Page.navigate", { url: `${origin}/broken` });
  check(await until("document.readyState === 'complete' && document.getElementById('route-error')?.dataset.status === '500'"), "the error page shows in the browser");
  await delay(300);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", "the error page adopts the server DOM");

  // loading.jsx on a client navigation to a slow loader, then the page.
  await send("Page.navigate", { url: `${origin}/links` });
  check(await until("document.readyState === 'complete' && !!document.querySelector('a[href=\"/slow\"]')"), "the links page loads");
  await delay(200);
  await evaluate(`document.querySelector('a[href="/slow"]').click()`);
  check(await until(shows("slow-loading"), 800), "a slow navigation shows loading.jsx");
  check(await until(`document.getElementById('slow-page')?.textContent === 'loaded' && ${shows("slow-page")} && !${shows("slow-loading")}`), "the page replaces loading.jsx once its data arrives");

  // Layout loaders: the merged data reaches the shell and the page on the server.
  const shellHtml = await (await fetch(`${origin}/shell`)).text();
  check(/id="shell-user"[^>]*>(?:<!--[^>]*-->)*ada/.test(shellHtml) && shellHtml.includes("home") && shellHtml.includes("pro"), "a layout loader and the page's loader merge on the server");
  await send("Page.navigate", { url: `${origin}/shell` });
  check(await until("document.readyState === 'complete' && document.getElementById('shell-page')?.textContent.includes('home pro')"), "the shell page shows both loaders' data");
  await delay(300);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", "the layout-loader page adopts the server DOM");
  await evaluate(`document.querySelector('a[href="/shell/settings"]').click()`);
  check(await until("document.getElementById('settings-page')?.textContent === 'settings for ada' && document.getElementById('shell-user')?.textContent === 'ada'"), "a page without its own loader gets the layout's data on client navigation");

  // A failed layout loader: the error.jsx above that layout, with status 500.
  const team = await fetch(`${origin}/team/x`);
  const teamHtml = await team.text();
  check(team.status === 500 && teamHtml.includes('id="team-error"') && !teamHtml.includes('id="x-shell"'), `a failed layout loader renders the error.jsx above its layout (got ${team.status})`);
  await send("Page.navigate", { url: `${origin}/team/x` });
  check(await until("document.readyState === 'complete' && !!document.getElementById('team-error') && !document.getElementById('x-shell')"), "the layout error page shows in the browser without the broken layout");

  // Route groups: the URL has no group, the page gets the group's layout and middleware.
  const catalog = await fetch(`${origin}/catalog`);
  const catalogHtml = await catalog.text();
  check(catalog.status === 200 && catalogHtml.includes('id="shop-shell"') && catalogHtml.includes('id="catalog"'), "a grouped page renders at its URL inside its group's layout");
  check(catalog.headers.get("x-group") === "shop", "the group's middleware runs for the group's pages");
  check((await fetch(`${origin}/todos`)).headers.get("x-group") === null, "the group's middleware does not run outside the group");
  check((await fetch(`${origin}/(shop)/catalog`)).status === 404, "the group folder is not part of any URL");
  await send("Page.navigate", { url: `${origin}/catalog` });
  check(await until("document.readyState === 'complete' && !!document.getElementById('catalog')"), "the grouped page loads in the browser");
  await delay(300);
  check((await evaluate("JSON.stringify(window.__removed)")) === "[]", "the grouped page adopts the server DOM");
  await evaluate(`document.querySelector('a[href="/cart"]').click()`);
  check(await until("!!document.getElementById('cart') && !!document.getElementById('shop-shell')"), "client navigation inside the group keeps the group's layout");

  // Optional segments: one page, with or without the segment.
  const text = async (path) => (await (await fetch(`${origin}${path}`)).text()).replace(/<!--[\s\S]*?-->/g, "");
  check((await text("/guide")).includes("guide en"), "[[lang]] matches without the segment");
  check((await text("/fr/guide")).includes("guide fr"), "[[lang]] matches with the segment");
  check((await text("/browse")).includes(">all<"), "[[...filters]] matches with no segments");
  check((await text("/browse/red/large")).includes(">red+large<"), "[[...filters]] matches several segments");

  // Lazy components: the server sends the placeholder; the chunk loads when needed.
  const lazyHtml = await (await fetch(`${origin}/lazy`)).text();
  check(/<afw-lazy-inline-[0-9a-f]{8}[^>]*><template shadowrootmode="open">/.test(lazyHtml) && !lazyHtml.includes("map of"), "the server sends a lazy component's placeholder, not its content");
  await send("Page.navigate", { url: `${origin}/lazy` });
  check(await until("document.readyState === 'complete' && document.getElementById('lazy-map')?.textContent === 'map of Lyon'"), "a lazy component rendered on the page loads and renders after hydration");
  await delay(300);
  const chunks = () => evaluate("performance.getEntriesByType('resource').filter((e) => /LazyMap/.test(e.name)).length");
  check((await chunks()) === 1, "its code is a separate chunk, fetched once");
  await evaluate("document.getElementById('open-map').click()");
  check(await until("document.querySelectorAll('#lazy-map').length === 2"), "a second use renders from the same chunk");
  check((await chunks()) === 1, "no second download");

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
