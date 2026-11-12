// Real-browser check of server functions in the esdev workflow (`tsr test-e2e-esdev-fns`),
// plus `PUBLIC_*` env vars rendered on the server and hydrated in the browser:
// an installed-style project whose server target is the generated `@afw/server`
// (`mode: "ssr"`), run by `esdev start` and driven in headless Chrome, then built with
// `esdev build` and run as a production server.
//
//   esdev scripts/verify-server-functions.mjs
import { Command } from "runtime:system";
import { copy, file, makeTempDir, mkdir, readDir, realPath, remove, stat, write } from "runtime:fs";
import { arch, cwd, env, platform } from "runtime:process";

const root = cwd(), children = [], logs = [], errors = [];
const cache = `${root}/.cache`;
await mkdir(cache, { recursive: true });
const project = await makeTempDir({ dir: cache, prefix: "fns-fixture-" });

async function copyPath(from, to) {
  if ((await stat(from)).isDir) {
    await mkdir(to, { recursive: true });
    for (const entry of await readDir(from)) await copyPath(`${from}/${entry.name}`, `${to}/${entry.name}`);
  } else { await mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true }); await copy(from, to); }
}
// Published package files only, as an install lays them out.
for (const name of ["afw", "afw-build", "esdev-plugin-afw", "afw-compiler"]) {
  const source = `${root}/packages/${name}`;
  const manifest = await file(`${source}/package.json`).json();
  for (const path of ["package.json", ...manifest.files.filter((p) => !p.startsWith("!") && p !== "bin")]) {
    await copyPath(`${source}/${path}`, `${project}/node_modules/@opentf/${name}/${path}`);
  }
}
for (const dep of Object.keys((await file(`${root}/packages/afw/package.json`).json()).dependencies ?? {})) {
  await copyPath(await realPath(`${root}/packages/afw/node_modules/${dep}`), `${project}/node_modules/${dep}`);
}
const os = { linux: "linux", macos: "darwin", windows: "win32" }[platform];
const cpu = { x86_64: "x64", aarch64: "arm64" }[arch];
const binary = platform === "windows" ? "afwc.exe" : "afwc";
await copyPath(`${root}/target/debug/${binary}`, `${project}/node_modules/@opentf/afw-compiler/bin/${os}-${cpu}/${binary}`);

const appPort = 25000 + Math.floor(Math.random() * 10000);
await write(`${project}/package.json`, JSON.stringify({ private: true, type: "module" }));
await write(`${project}/esdev.json`, JSON.stringify({
  plugins: [{ module: "@opentf/esdev-plugin-afw", options: { mode: "ssr" } }],
  build: { targets: {
    web: { entry: "index.html", outdir: "dist" },
    server: { entry: "server.js", out: "dist/server.js" },
  } },
  dev: { run: "server", app: { port: appPort } },
}));
await write(`${project}/index.html`, '<!doctype html><html><head><title>fns</title></head><body><div id="app"></div><script type="module" src="./entry.js"></script></body></html>');
await write(`${project}/entry.js`, 'import { mountApp } from "@opentf/afw"; import { loaderRoutes, pages } from "@afw/routes"; mountApp({ pages, loaders: loaderRoutes, target: document.getElementById("app") });');
// The whole server: the generated handler, the built assets and the shell.
await write(`${project}/server.js`, `import { serve } from "runtime:http";
import { file } from "runtime:fs";
import { env } from "runtime:process";
import { createHandler, createPageRenderer } from "@afw/server";

// Beside this bundle: dist/ in production, .dev/dist/ under esdev start.
const outDir = new URL("./", import.meta.url);
const TYPES = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", map: "application/json" };
async function files(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/" || pathname.endsWith(".html")) return null;
  const asset = file(new URL("." + pathname, outDir));
  if (!(await asset.exists())) return null;
  return new Response(asset.stream(), { headers: { "content-type": TYPES[pathname.split(".").pop()] ?? "application/octet-stream" } });
}
const shell = await file(new URL("./index.html", outDir)).text();
const handle = createHandler({ files, renderPage: createPageRenderer({ shell }), fallback: () => new Response("Not found", { status: 404 }) });
const server = serve({ hostname: "127.0.0.1", port: Number(env.PORT ?? "${appPort}") }, handle);
console.log("listening on http://127.0.0.1:" + (await server.addr).port);
`);
await mkdir(`${project}/app/todos`, { recursive: true });
await write(`${project}/app/_middleware.js`, `export default async function middleware(request, context, next) {
  context.locals.user = "ada";
  return next();
}`);
await write(`${project}/app/page.jsx`, 'export default function Home() { return <h1 id="home">Home</h1>; }');
await write(`${project}/app/todos/todos.server.js`, `import { action, query } from "@opentf/afw/server";
const todos = ["write the server functions", "test them on esdev"];
export const listTodos = query(async (_, { locals }) => ({ todos, user: locals.user, version: "A" }));
export const addTodo = action(async ({ title } = {}, { locals }) => {
  if (!title) throw new Response(null, { status: 400 });
  todos.push(title);
  return { todos, user: locals.user };
});
export const SECRET = "server-only-secret-5d1e";`);
await write(`${project}/app/todos/loader.js`, `import { listTodos } from "./todos.server.js";
export default async function loader({ locals }) { return listTodos(undefined, { locals }); }`);
await write(`${project}/app/todos/page.jsx`, `import { router } from "@opentf/afw";
import { addTodo, listTodos } from "./todos.server.js";

export default function Todos() {
  let added = $state(null);
  const todos = $derived(added ?? router.data?.todos ?? []);
  if (typeof window !== "undefined") window.__fns = { addTodo, listTodos };
  return (
    <section>
      <p id="user">{router.data?.user}</p>
      <ul id="list">{todos.map((todo) => <li>{todo}</li>)}</ul>
      <button id="add" onclick={async () => { added = (await addTodo({ title: "ship it" })).todos; }}>Add</button>
    </section>
  );
}`);

// PUBLIC_* env: compiled into the server render and the client alike; the secret
// beside it in .env reaches neither.
await write(`${project}/.env`, "PUBLIC_GREETING=hello-from-env\nSECRET_TOKEN=do-not-ship-me\n");
await mkdir(`${project}/app/env`, { recursive: true });
await write(`${project}/app/env/EnvGreeting.jsx`, `export default function EnvGreeting() {
  let clicks = $state(0);
  return <button id="env-greeting" onclick={() => clicks++}>{import.meta.env.PUBLIC_GREETING} {clicks}</button>;
}`);
await write(`${project}/app/env/page.jsx`, `import EnvGreeting from "./EnvGreeting.jsx";
export default function EnvPage() {
  return <div><EnvGreeting /><p id="env-mode">{import.meta.env.MODE}</p><p id="env-secret">[{import.meta.env.SECRET_TOKEN ?? "none"}]</p></div>;
}`);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function launch(args, options = {}) {
  const child = await new Command(args[0], { args: args.slice(1), cwd: project, inheritEnv: true, stdout: "piped", stderr: "piped", ...options }).spawn();
  children.push(child);
  logs.push(Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]));
  return child;
}
async function ready(url) {
  for (let i = 0; i < 300; i++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await delay(100);
  }
  throw Error(`Server unavailable: ${url}`);
}
function assert(value, label) { if (!value) throw Error(label); console.log(`PASS ${label}`); }
const stopAll = async () => { for (const child of children.splice(0).reverse()) { try { child.kill(); await child.status; } catch {} } };

const profile = await makeTempDir({ dir: cache, prefix: "fns-chrome-" });
let ws, passed = false;
try {
  const chromePort = appPort + 3;
  await launch([env.CHROMIUM_BIN || env.CHROME_BIN || "/usr/bin/chromium", "--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${chromePort}`, "about:blank"]);
  const targets = await (await ready(`http://127.0.0.1:${chromePort}/json`)).json();
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(Error(m.error.message)) : resolve(m.result); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  async function until(expression) { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return true; await delay(100); } throw Error(`Browser timeout: ${expression}`); }
  await send("Runtime.enable");

  // ------------------------------------------------------------------ esdev start
  const devServer = await launch(["esdev", "start", `--port=${appPort}`]);
  const origin = `http://127.0.0.1:${appPort}`;
  await ready(origin);
  const ssr = await (await fetch(`${origin}/todos`, { headers: { accept: "text/html" } })).text();
  assert(ssr.includes("write the server functions") && /id="user"[^>]*>(?:<!--[^>]*-->)*ada/.test(ssr), "the page is server-rendered with its loader's direct server function call");
  // The dev client is a CSR build (component refresh): it cannot adopt server DOM, so the
  // dev server must not mark the page for hydration.
  assert(!ssr.includes("data-afw-hydrate"), "the dev server does not mark pages for hydration");
  const stub = await (await fetch(`${origin}/app/todos/todos.server.js`)).text().catch(() => "");
  assert(!stub.includes("server-only-secret"), "the server module's source is never served");

  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__doc = crypto.randomUUID();" });
  await send("Page.navigate", { url: `${origin}/todos` });
  await until("document.querySelectorAll('#list li').length === 2 && !!window.__fns");
  const doc = await evaluate("window.__doc");
  await evaluate("document.getElementById('add').click()");
  await until("[...document.querySelectorAll('#list li')].some((li) => li.textContent === 'ship it')");
  assert(true, "a click calls the action through its stub and the list updates");
  assert((await evaluate("window.__fns.listTodos().then((r) => r.user + ' ' + r.todos.length)")) === "ada 3", "a query sees the middleware's locals and the action's write");
  assert((await evaluate("window.__fns.addTodo({}).catch((e) => e.name + ' ' + e.status)")) === "ServerFunctionError 400", "a refused call rejects with ServerFunctionError and its status");
  const source = `${project}/app/todos/todos.server.js`;
  await write(source, (await file(source).text()).replace('version: "A"', 'version: "B"'));
  // The restart leaves a brief gap with no server; a call that lands in it is "not yet".
  await until("window.__fns.listTodos().then((r) => r.version === 'B', () => false)");
  assert((await evaluate("window.__doc")) === doc, "an edited server function answers after the restart, without a page reload");
  const plain = async (url) => (await (await fetch(url, { headers: { accept: "text/html" } })).text()).replace(/<!--[\s\S]*?-->/g, "");
  const envDev = await plain(`${origin}/env`);
  assert(envDev.includes(">hello-from-env 0</button>") && envDev.includes(">development</p>") && envDev.includes("[none]") && !envDev.includes("do-not-ship-me"), "esdev start renders PUBLIC_* and MODE on the server, and no other variable");
  await send("Page.navigate", { url: `${origin}/env` });
  await until("document.readyState === 'complete' && document.getElementById('env-greeting')?.textContent === 'hello-from-env 0'");
  await delay(300);
  await evaluate("document.getElementById('env-greeting').click()");
  await until("document.getElementById('env-greeting').textContent === 'hello-from-env 1'");
  assert(true, "the browser component reads PUBLIC_* under esdev start");
  const failures = errors.filter((e) => e && !e.includes("favicon") && !e.includes("400"));
  assert(failures.length === 0, "no browser errors: " + JSON.stringify(failures));
  // Stop the dev server only; the browser stays for the production checks.
  try { devServer.kill(); await devServer.status; } catch {}

  // ------------------------------------------------------------------ production
  const built = await new Command("esdev", { args: ["build"], cwd: project, inheritEnv: true, stdout: "piped", stderr: "piped" }).output();
  assert(built.success, "esdev build succeeds: " + new TextDecoder().decode(built.stderr).slice(-400));
  const assets = `${project}/dist/assets`;
  let client = "";
  for (const entry of await readDir(assets)) if (entry.name.endsWith(".js")) client += await file(`${assets}/${entry.name}`).text();
  assert(!client.includes("server-only-secret"), "the client bundle has none of the server module");
  const endpoint = client.match(/\/todos\/__fn\/[0-9a-f]{16}/g);
  assert(endpoint?.length >= 1, "the client bundle calls the endpoints");
  const prodPort = appPort + 7;
  await launch(["esdev", "dist/server.js"], { env: { PORT: String(prodPort) } });
  const prod = `http://127.0.0.1:${prodPort}`;
  await ready(`${prod}/`);
  const prodHtml = await (await fetch(`${prod}/todos`, { headers: { accept: "text/html" } })).text();
  assert(prodHtml.includes("test them on esdev"), "the built server renders the page");
  assert(prodHtml.includes("data-afw-hydrate"), "the built server marks the page for hydration");
  let answered = 0;
  for (const path of new Set(endpoint)) {
    const res = await fetch(`${prod}${path}`, { method: "POST", headers: { origin: prod, "content-type": "application/json" }, body: '{"v":{"title":"from prod"}}' });
    if (res.status === 200 && (await res.json()).v.user === "ada") answered++;
  }
  assert(answered >= 1, "the built server answers its server functions under the middleware");
  assert(client.includes("hello-from-env") && !client.includes("do-not-ship-me"), "the client bundle carries PUBLIC_* and no other variable");
  const envProd = (await (await fetch(`${prod}/env`, { headers: { accept: "text/html" } })).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert(envProd.includes(">hello-from-env 0</button>") && envProd.includes(">production</p>") && envProd.includes("[none]"), "the built server renders PUBLIC_* and MODE");
  assert(!(await file(`${project}/dist/server.js`).text()).includes("do-not-ship-me"), "the server bundle has no non-public variable compiled in");
  await send("Page.navigate", { url: `${prod}/env` });
  await until("document.readyState === 'complete' && document.getElementById('env-greeting')?.textContent === 'hello-from-env 0'");
  await delay(300);
  await evaluate("document.getElementById('env-greeting').click()");
  await until("document.getElementById('env-greeting').textContent === 'hello-from-env 1'");
  assert(true, "the hydrated component keeps the PUBLIC_ value in production");
  passed = true;
} finally {
  ws?.close();
  await stopAll();
  const output = await Promise.all(logs);
  if (!passed || env.FNS_VERBOSE) for (const [out, err] of output) if (out || err) console.log("OUTPUT", out, err);
  await remove(project, { recursive: true });
  for (let retry = 0; retry < 5; retry++) { try { await remove(profile, { recursive: true }); break; } catch { await delay(100); } }
}
