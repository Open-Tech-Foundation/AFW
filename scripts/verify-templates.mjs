#!/usr/bin/env esdev
// Verify every esdev starter end to end (`tsr verify-templates`).
//
//   esdev scripts/verify-templates.mjs [--only=app,docs] [--browser] [--dir=<path>]
//
// For every option combination of every template in packages/create-afw (`esdev create
// --from`): scaffold, install, put this checkout's packages over the published ones (what
// the next release ships), then typecheck, test, build, run the dev server and the
// production output, and check `PUBLIC_*` values in dev, build, server render, tests and
// types. `--browser` adds a headless Chromium pass (hydration, console, navigation) on one
// combination per template. Every warning the tools print is collected into a report
// (`report.md` in the work directory), the list of frictions to take upstream.
//
// It works in ~/.cache/afw-templates (a solid-state disk here; `--dir=` to change it). A
// script can only write inside its own directory, so it copies itself there and runs again.

import { exists, file, mkdir, readDir, write } from "runtime:fs";
import { args, cwd, env, exit } from "runtime:process";
import { Command } from "runtime:system";

const option = (name, fallback) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const decoder = new TextDecoder();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const esdev = env.ESDEV_BIN || "esdev";

async function run(program, argv, { dir, extraEnv = {}, timeout = 600_000 } = {}) {
  const started = performance.now();
  try {
    const result = await new Command(program, { args: argv, cwd: dir, inheritEnv: true, env: extraEnv, stdout: "piped", stderr: "piped", timeout }).output();
    return { ok: result.success, out: decoder.decode(result.stdout) + decoder.decode(result.stderr), ms: performance.now() - started };
  } catch (error) {
    return { ok: false, out: String(error?.message ?? error), ms: performance.now() - started };
  }
}

// ── 1. Relocate into the work directory ────────────────────────────────────────
const repoArg = option("repo", null);
if (!repoArg) {
  const repo = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const work = option("dir", `${env.HOME}/.cache/afw-templates`);
  for (const [program, argv] of [["mkdir", ["-p", work]], ["cp", [`${repo}/scripts/verify-templates.mjs`, `${work}/verify-templates.mjs`]]]) {
    const step = await run(program, argv, { dir: repo });
    if (!step.ok) { console.error(step.out); exit(1); }
  }
  const child = await new Command(esdev, { args: ["verify-templates.mjs", `--repo=${repo}`, ...args], cwd: work, inheritEnv: true, stdout: "inherit", stderr: "inherit" }).spawn();
  exit((await child.status).code ?? 1);
}

// ── 2. In the work directory ──────────────────────────────────────────────────
const repo = repoArg;
const work = cwd();
const afwc = `${repo}/target/release/afwc`;
if (!(await run("test", ["-x", afwc])).ok) {
  console.error(`✗ no ${afwc}: run \`cargo build --release -p afw_cli\` first`);
  exit(1);
}
const only = option("only", "").split(",").filter(Boolean);
const browser = flag("browser");
const verbose = flag("verbose");

// Every combination of each template's options (template.json), with its own label.
async function combinations() {
  const out = [];
  const templates = `${repo}/packages/create-afw/esdev/templates`;
  for (const entry of await run("ls", [templates]).then((r) => r.out.split("\n").filter(Boolean))) {
    if (!(await run("test", ["-f", `${templates}/${entry}/template.json`])).ok) continue;
    if (only.length && !only.includes(entry)) continue;
    const spec = JSON.parse((await run("cat", [`${templates}/${entry}/template.json`])).out);
    let combos = [{}];
    for (const opt of spec.options ?? []) {
      const next = [];
      for (const combo of combos) {
        const asked = !opt.when || Object.entries(opt.when).every(([k, vs]) => vs.includes(combo[k]));
        const values = asked ? opt.choices.map((c) => c.value) : [opt.otherwise];
        for (const value of values) next.push({ ...combo, [opt.name]: value });
      }
      combos = next;
    }
    for (const combo of combos) out.push({ template: entry, options: combo });
  }
  return out;
}

const flags = ({ template, options }) => [
  `--template=${template}`,
  ...Object.entries(options).map(([k, v]) => (v === "yes" ? `--${k}` : v === "no" ? `--no-${k}` : `--${k}=${v}`)),
];
const label = ({ template, options }) => [template, ...Object.values(options)].join("-");

// This checkout's packages, as published (their `files`), over the installed ones. pnpm
// links each package from its virtual store; the link's target directory is replaced (its
// files were hard links into the store, which `rm` only unlinks).
async function overlay(dir) {
  // Every AFW package in pnpm's virtual store, direct dependencies and transitive ones alike
  // (`afw-build` and `afw-compiler` arrive through `esdev-plugin-afw`): each is a real
  // directory `.pnpm/@opentf+<name>@<version>…/node_modules/@opentf/<name>`.
  const stored = await run("sh", ["-c", "find node_modules/.pnpm -mindepth 4 -maxdepth 4 -type d -path '*/node_modules/@opentf/*' 2>/dev/null"], { dir });
  for (const path of stored.out.split("\n").filter(Boolean)) {
    const name = path.split("/").pop();
    // The compiler package carries its platform binary, which this checkout's `files` leave
    // out: keep it, and run this checkout's compiler through AFWC_BIN instead.
    if (name === "afw-compiler") continue;
    const source = `${repo}/packages/${name}`;
    if (!(await run("test", ["-f", `${source}/package.json`])).ok) continue;
    const manifest = JSON.parse((await run("cat", [`${source}/package.json`])).out);
    const target = `${dir}/${path}`;
    const files = ["package.json", ...(manifest.files ?? []).filter((f) => !f.startsWith("!") && f !== "bin")];
    const script = `rm -rf "${target}" && mkdir -p "${target}" && cd "${source}" && for f in ${files.map((f) => `"${f}"`).join(" ")}; do [ -e "$f" ] && cp -r --parents "$f" "${target}/"; done; true`;
    const step = await run("sh", ["-c", script], { dir });
    if (!step.ok) throw Error(`overlay ${name}: ${step.out}`);
  }
}

// A page and a test reading `PUBLIC_VERIFY`, so dev, build, server render, tests and types
// are each checked for it.
async function addEnvProbe(dir, ts) {
  const ext = ts ? "tsx" : "jsx";
  await run("sh", ["-c", `printf 'PUBLIC_VERIFY=hello-env\\nSECRET_VERIFY=do-not-ship\\n' > .env && mkdir -p app/env-probe tests/ui`], { dir });
  await write(`${dir}/app/env-probe/page.${ext}`,
    // Only PUBLIC_* names are typed on import.meta.env; the secret is read untyped on
    // purpose (it must read as undefined).
    `export default function EnvProbe() {\n  const value${ts ? ": string | undefined" : ""} = import.meta.env.PUBLIC_VERIFY;\n  const all = import.meta.env${ts ? " as unknown as Record<string, unknown>" : ""};\n  return <p id="env">env={value} mode={import.meta.env.MODE} secret={String(all.SECRET_VERIFY ?? "none")}</p>;\n}\n`);
  await write(`${dir}/tests/ui/env-probe.test.${ts ? "ts" : "js"}`,
    `import { expect, test } from "@opentf/afw-test/test";\ntest("import.meta.env in tests", () => {\n  expect(import.meta.env.PUBLIC_VERIFY).toBe("hello-env");\n  expect(import.meta.env.MODE).toBe("test");\n});\n`);
}

// Servers run in their own process group (`setsid`), so stopping one stops what it
// started too: `pnpm start` runs `esrun`, and `esdev start` runs the app's server.
async function startServer(program, argv, dir, url) {
  const child = await new Command("setsid", { args: [program, ...argv], cwd: dir, inheritEnv: true, env: { AFWC_BIN: afwc }, stdout: "piped", stderr: "piped" }).spawn();
  const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]).then((parts) => parts.join(""));
  const server = { child, output, pid: child.pid };
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return server;
    } catch {
      await delay(100);
    }
  }
  await stop(server);
  return { ...server, child: null, failed: true };
}
// (No `--` before the group: dash's `kill` reads it as a number and fails.)
async function stop(server) {
  if (!server) return "";
  if (server.child) {
    await run("sh", ["-c", `kill -TERM -${server.pid} 2>/dev/null; sleep 1; kill -KILL -${server.pid} 2>/dev/null; true`]);
    try { await server.child.status; } catch {}
  }
  // The output closes once every process of the group has exited; never wait forever.
  return await Promise.race([server.output, delay(5000).then(() => "(output still open after stop)")]);
}

const free = () => 41000 + Math.floor(Math.random() * 8000);
async function page(origin, path) {
  try {
    const response = await fetch(origin + path, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
    return { status: response.status, html: await response.text() };
  } catch (error) {
    return { status: 0, html: String(error) };
  }
}
const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

// Warnings worth taking upstream: anything a tool printed as a warning or error that
// a passing run still printed.
const NOISE = [/^\s*$/, /Done in/, /Progress:/, /packages are/, /Packages:/, /^\+/, /Lockfile/, /Already up to date/];
function warnings(text) {
  return text.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter((l) => /\b(warn|warning|deprecated|⚠|error)\b/i.test(l) && !NOISE.some((n) => n.test(l)));
}

const report = [];
const frictions = new Map(); // warning line → combos
const note = (combo, text) => {
  for (const line of warnings(text)) {
    const key = line.replace(/\/[^\s]*afw-templates\/[^\s/]+/g, "<project>").replace(/\d+(\.\d+)?\s?(ms|s)\b/g, "<time>");
    if (!frictions.has(key)) frictions.set(key, new Set());
    frictions.get(key).add(combo);
  }
};

async function verify(combo) {
  const name = label(combo);
  const dir = `${work}/${name}`;
  const ts = combo.options.language === "ts";
  const steps = [];
  const step = (label, ok, detail = "", ms = 0) => steps.push({ label, ok, detail, ms });
  // `--verbose`: say what is about to run, so a step that hangs is named.
  const doing = (what) => verbose && console.error(`  … ${name}: ${what}`);
  await run("rm", ["-rf", dir]);
  doing(`create`);
  const created = await run(esdev, ["create", name, `--from=${repo}/packages/create-afw`, ...flags(combo), "--package-manager=pnpm", "--no-install", "-y"], { dir: work });
  note(name, created.out);
  step("create", created.ok, created.ok ? "" : created.out.slice(-400), created.ms);
  if (!created.ok) return { name, steps };
  doing(`install`);
  const installed = await run("pnpm", ["install", "--ignore-workspace"], { dir });
  note(name, installed.out);
  step("install", installed.ok, installed.ok ? "" : installed.out.slice(-400), installed.ms);
  if (!installed.ok) return { name, steps };
  doing(`overlay`);
  await overlay(dir);
  await addEnvProbe(dir, ts);
  const manifest = JSON.parse(await file(`${dir}/package.json`).text());
  const scripts = manifest.scripts ?? {};
  const extraEnv = { AFWC_BIN: afwc };
  for (const script of ["typecheck", "test", "build"]) {
    if (!scripts[script]) continue;
    doing(`${script}`);
    const result = await run("pnpm", ["run", "--silent", script], { dir, extraEnv });
    note(name, result.out);
    step(script, result.ok, result.ok ? "" : result.out.slice(-600), result.ms);
  }
  // A build that ships no secret: the non-PUBLIC_ value never reaches the output.
  if (scripts.build) {
    const leaked = await run("grep", ["-rl", "do-not-ship", "dist"], { dir });
    step("no secret in dist", !leaked.ok, leaked.ok ? leaked.out : "");
  }

  // Dev server: every page answers, and a server-rendered page carries the env value.
  const port = free();
  doing(`dev start`);
  const dev = await startServer(esdev, ["start", `--port=${port}`], dir, `http://127.0.0.1:${port}/`);
  if (dev.failed) step("dev start", false, (await dev.output).slice(-600));
  else {
    const origin = `http://127.0.0.1:${port}`;
    doing(`dev pages`);
    const paths = ["/", "/env-probe", ...(await routesOf(dir))];
    const statuses = [];
    for (const path of new Set(paths)) statuses.push([path, (await page(origin, path)).status]);
    const bad = statuses.filter(([, s]) => s !== 200);
    step("dev pages", bad.length === 0, bad.map(([p, s]) => `${p} → ${s}`).join(", "));
    const probe = plain((await page(origin, "/env-probe")).html);
    const rendered = probe.includes('id="env"');
    if (rendered) step("dev server render env", probe.includes("env=hello-env mode=development secret=none"), probe.match(/<p id="env">[^<]*/)?.[0] ?? "");
    doing(`browser (dev)`);
    if (browser && combo.browserCheck) step(...(await browserCheck(origin, "dev")));
  }
  doing(`dev stop`);
  note(name, await stop(dev));

  // Production output: the built server, or a static preview.
  if (scripts.build) {
    const isServer = await exists(`${dir}/dist/server.js`);
    const prodPort = isServer ? 3000 : free();
    doing(`prod start`);
    const prod = isServer
      ? await startServer("sh", ["-c", `PATH="$PWD/node_modules/.bin:$PATH" exec ${scripts.start}`], dir, `http://127.0.0.1:${prodPort}/`)
      : await startServer(esdev, ["preview", `--port=${prodPort}`, ...(scripts.preview?.includes("--spa") ? ["--spa"] : [])], dir, `http://127.0.0.1:${prodPort}/`);
    if (prod.failed) step("prod start", false, (await prod.output).slice(-600));
    else {
      const origin = `http://127.0.0.1:${prodPort}`;
      const statuses = [];
      for (const path of new Set(["/", "/env-probe", ...(await routesOf(dir))])) statuses.push([path, (await page(origin, path)).status]);
      const bad = statuses.filter(([, s]) => s !== 200);
      step("prod pages", bad.length === 0, bad.map(([p, s]) => `${p} → ${s}`).join(", "));
      const probe = plain((await page(origin, "/env-probe")).html);
      if (probe.includes('id="env"')) step("prod server render env", probe.includes("env=hello-env mode=production secret=none"), probe.match(/<p id="env">[^<]*/)?.[0] ?? "");
      if (browser && combo.browserCheck) step(...(await browserCheck(origin, "prod")));
    }
    doing(`prod stop`);
    note(name, await stop(prod));
  }
  return { name, steps };
}

// The page routes a project has (`app/**/page.*`), as URLs.
async function routesOf(dir) {
  const found = await run("sh", ["-c", "find app -name 'page.*' | sort"], { dir });
  return found.out.split("\n").filter(Boolean).map((p) => {
    const route = p.replace(/^app/, "").replace(/\/page\.[^/]+$/, "").replace(/\/\([^)]+\)/g, "");
    return route.includes("[") ? null : route || "/";
  }).filter(Boolean);
}

// ── Browser pass ──────────────────────────────────────────────────────────────
async function browserCheck(origin, phase) {
  const port = free();
  const profile = `${work}/.chrome-${port}`;
  const chrome = await new Command(env.CHROMIUM_BIN || "chromium", { args: ["--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], stdout: "null", stderr: "piped" }).spawn();
  const chromeLog = new Response(chrome.stderr).text();
  const problems = [];
  // Every browser wait is bounded: a crashed browser must fail the check, not hang the run.
  const within = (promise, ms, what) => Promise.race([promise, delay(ms).then(() => { throw Error(`timed out: ${what}`); })]);
  try {
    let targets;
    for (let i = 0; i < 100 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2_000) })).json(); } catch { await delay(100); } }
    if (!targets) throw Error("the browser did not start");
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await within(new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(Error("websocket error")); }), 10_000, "devtools socket");
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)}`);
      if (m.method === "Network.responseReceived" && m.params.response.status >= 400) problems.push(`${m.params.response.status} ${m.params.response.url}`);
    };
    const send = (method, params = {}) => within(new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); }), 20_000, method);
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.enable");
    // The body only: a client-rendered route replacing the shell's <title> is expected.
    await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__removed=[];new MutationObserver(rs=>{for(const r of rs){if(r.target.closest&&r.target.closest('head'))continue;for(const n of r.removedNodes)if(n.nodeType===1&&document.readyState!=='loading')window.__removed.push(n.localName+'.'+(n.className||''))}}).observe(document,{childList:true,subtree:true});" });
    await send("Page.navigate", { url: `${origin}/` });
    await delay(2500);
    const removed = await evaluate("JSON.stringify(window.__removed)");
    if (removed && removed !== "[]") problems.push(`server DOM rebuilt: ${removed.slice(0, 200)}`);
    // Client navigation to the env probe through a link, when the page has one; else load it.
    await evaluate("window.__kept = 1");
    await send("Page.navigate", { url: `${origin}/env-probe` });
    await delay(2000);
    const text = await evaluate("document.getElementById('env')?.textContent ?? ''");
    if (!text.includes("env=hello-env")) problems.push(`env probe shows ${JSON.stringify(text)}`);
    ws.close();
  } catch (error) {
    problems.push(`browser check failed: ${error?.message ?? error}`);
    const log = await Promise.race([chromeLog, delay(1000).then(() => "")]);
    if (log.trim()) problems.push(`browser stderr: ${log.trim().split("\n").slice(-3).join(" | ").slice(0, 300)}`);
  } finally {
    chrome.kill();
    await run("rm", ["-rf", profile]);
  }
  return [`browser (${phase})`, problems.length === 0, problems.join("; ")];
}

// ── Run ───────────────────────────────────────────────────────────────────────
const limit = Number(option("limit", "0"));
const combos = (await combinations()).slice(0, limit || undefined);
const seen = new Set();
for (const combo of combos) {
  if (!seen.has(combo.template)) { combo.browserCheck = true; seen.add(combo.template); }
  // One server-rendered and one client-rendered app get the browser pass too.
  if (combo.template === "app" && ["server", "mixed"].includes(combo.options.render) && combo.options.styling === "css" && combo.options.language === "ts") combo.browserCheck = true;
}
console.log(`verify-templates — ${combos.length} combinations${browser ? ", with a browser pass" : ""}\n`);
let failed = 0;
for (const combo of combos) {
  const result = await verify(combo);
  const bad = result.steps.filter((s) => !s.ok);
  failed += bad.length ? 1 : 0;
  const line = result.steps.map((s) => `${s.label}${s.ok ? "✓" : "✗"}${s.ms > 15000 ? `(${(s.ms / 1000).toFixed(0)}s)` : ""}`).join(" ");
  console.log(`${bad.length ? "✗" : "✓"} ${result.name}: ${line}`);
  for (const s of bad) console.log(`    ${s.label}: ${s.detail.replace(/\n/g, "\n      ").slice(0, 800)}`);
  report.push(result);
}

const lines = [`# esdev template verification`, "", `${combos.length} combinations, ${failed} with failures.`, "", "## Results", ""];
for (const r of report) {
  lines.push(`- ${r.steps.every((s) => s.ok) ? "✓" : "✗"} \`${r.name}\`: ${r.steps.map((s) => `${s.label} ${s.ok ? "✓" : "✗"} ${(s.ms / 1000).toFixed(1)}s`).join(", ")}`);
  for (const s of r.steps.filter((s) => !s.ok)) lines.push(`  - ${s.label}: ${s.detail.replace(/\n/g, " ").slice(0, 600)}`);
}
lines.push("", "## Warnings printed by the tools", "");
for (const [line, where] of [...frictions].sort((a, b) => b[1].size - a[1].size)) lines.push(`- (${where.size}×) ${line}`);
await write(`${work}/report.md`, lines.join("\n") + "\n");
console.log(`\nreport: ${work}/report.md`);
exit(failed ? 1 : 0);
