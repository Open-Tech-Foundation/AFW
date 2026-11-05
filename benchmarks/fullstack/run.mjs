// The full-stack benchmark harness: for each framework and app size K, build (cold,
// median of three: peak memory across the process tree, wall time), check output
// parity against the production server, then measure the dev server in Chrome (cold
// start to first rendered page, and edit-to-browser time).
//
//   node benchmarks/fullstack/run.mjs [--sizes=10,100,1000] [--only=afw-esdev,next] [--runs=3]
//
// Working copies live in ~/.cache/afw-fullstack-bench/<tool>; results are written to
// benchmarks/fullstack/results/<date>.json. Chrome comes from CHROME_BIN or /usr/bin/chromium.

import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { generate } from "./generate.mjs";
import { checkParity } from "./parity.mjs";
import { HMR_EDIT } from "./spec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
// Working copies: on a solid-state disk — not a spinning disk (cold reads of
// node_modules dominate) and not tmpfs (charged to RAM). Override with --work=<dir>.
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const WORK = argv.work ?? join(homedir(), ".cache", "afw-fullstack-bench");
const MEASURE = join(ROOT, "benchmarks", "ssg-build", "measure.py");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const PORT = 4300;

const bin = (name) => `node_modules/.bin/${name}`;
// app: the source folder in apps/; generator: the file conventions; caches: cleared
// before every cold build and dev start.
const TOOLS = {
  "afw-esdev": {
    app: "afw", generator: "afw", caches: ["dist", ".dev"],
    build: ["esdev", ["build", "--minify"]],
    start: (port) => ["esdev", ["dist/server.js"], { PORT: String(port) }],
    dev: (port) => ["esdev", ["start", `--port=${port}`]],
    counter: "components/Counter.jsx",
  },
  "afw-vite": {
    app: "afw", generator: "afw", caches: ["dist", "node_modules/.vite"],
    build: [bin("vite"), ["build", "--logLevel", "warn"]],
    start: (port) => ["node", ["dist/server/index.js"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("vite"), ["--port", String(port), "--strictPort", "--host", "127.0.0.1"]],
    counter: "components/Counter.jsx",
  },
  next: {
    app: "next", generator: "next", caches: [".next"],
    build: [bin("next"), ["build"]],
    start: (port) => [bin("next"), ["start", "-p", String(port), "-H", "127.0.0.1"]],
    dev: (port) => [bin("next"), ["dev", "-p", String(port), "-H", "127.0.0.1"]],
    counter: "components/Counter.jsx",
  },
  tanstack: {
    app: "tanstack", generator: "tanstack", caches: [".output", "dist", "node_modules/.vite", ".tanstack"],
    build: [bin("vite"), ["build"]],
    start: (port) => ["node", [".output/server/index.mjs"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("vite"), ["--port", String(port), "--strictPort", "--host", "127.0.0.1"]],
    counter: "components/Counter.jsx",
  },
  astro: {
    app: "astro", generator: "astro", caches: ["dist", ".astro", "node_modules/.astro", "node_modules/.vite"],
    build: [bin("astro"), ["build"]],
    start: (port) => ["node", ["dist/server/entry.mjs"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("astro"), ["dev", "--port", String(port), "--host", "127.0.0.1"]],
    counter: "components/Counter.jsx",
  },
  solidstart: {
    app: "solidstart", generator: "solidstart", caches: [".output", "dist", "node_modules/.vite", ".solid-start"],
    build: [bin("vite"), ["build"]],
    start: (port) => ["node", [".output/server/index.mjs"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("vite"), ["--port", String(port), "--strictPort", "--host", "127.0.0.1"]],
    counter: "components/Counter.jsx",
  },
  sveltekit: {
    app: "sveltekit", generator: "sveltekit", caches: ["build", ".svelte-kit", "node_modules/.vite"],
    build: [bin("vite"), ["build"]],
    start: (port) => ["node", ["build/index.js"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("vite"), ["dev", "--port", String(port), "--strictPort", "--host", "127.0.0.1"]],
    counter: "components/Counter.svelte",
  },
  nuxt: {
    app: "nuxt", generator: "nuxt", caches: [".output", ".nuxt", ".data", "node_modules/.cache", "node_modules/.vite"],
    build: [bin("nuxt"), ["build"]],
    start: (port) => ["node", [".output/server/index.mjs"], { PORT: String(port), HOST: "127.0.0.1" }],
    dev: (port) => [bin("nuxt"), ["dev", "--port", String(port), "--host", "127.0.0.1"]],
    counter: "app/components/Counter.vue",
  },
};

const args = argv;
const SIZES = (args.sizes ?? "10,100,1000").split(",").map(Number);
const ONLY = args.only ? args.only.split(",") : Object.keys(TOOLS);
const RUNS = Number(args.runs ?? 3);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const log = (...m) => console.log(...m);

async function prepare(id) {
  const tool = TOOLS[id];
  const dir = join(WORK, id);
  await mkdir(dir, { recursive: true });
  // Source files from apps/, keeping the installed node_modules.
  await cp(join(HERE, "apps", tool.app), dir, { recursive: true, force: true });
  if (!existsSync(join(dir, "node_modules"))) {
    log(`  installing ${id}…`);
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir, stdio: "inherit" });
  }
  return dir;
}

const clearCaches = (dir, tool) => Promise.all(tool.caches.map((c) => rm(join(dir, c), { recursive: true, force: true })));

function measureBuild(dir, tool, label) {
  const [cmd, cmdArgs] = tool.build;
  const out = execFileSync("python3", [MEASURE, label, join(WORK, "logs"), "--", cmd, ...cmdArgs], { cwd: dir, encoding: "utf8" });
  const result = JSON.parse(out.trim().split("\n").pop());
  if (result.exit !== 0) throw new Error(`${label}: build failed (see ${join(WORK, "logs", `${label}.log`)})`);
  return result;
}

function launch(dir, [cmd, cmdArgs, env = {}]) {
  const child = spawn(cmd, cmdArgs, { cwd: dir, env: { ...process.env, ...env, NODE_ENV: undefined }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let output = "";
  child.stdout.on("data", (c) => { output += c; });
  child.stderr.on("data", (c) => { output += c; });
  return { child, output: () => output, stop: () => stopServer(child) };
}

// Stop a server: its process group, then whatever still holds a benchmark port (a dev
// server that re-spawns itself, like astro dev, leaves the group).
async function stopServer(child) {
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await delay(300);
  for (const port of [PORT, PORT + 1]) {
    try { execFileSync("fuser", ["-k", "-TERM", `${port}/tcp`], { stdio: "ignore" }); } catch {}
  }
  await delay(300);
}

async function waitForHttp(url, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {}
    await delay(50);
  }
  return false;
}

// ── Chrome over CDP ──────────────────────────────────────────────────────────
async function startChrome() {
  const profile = join(tmpdir(), `fullstack-chrome-${process.pid}`);
  const child = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((resolve, reject) => {
    let text = "";
    child.stderr.on("data", (c) => { text += c; const m = text.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(new URL(m[1])); });
    child.once("exit", (code) => reject(new Error(`Chrome exited (${code})`)));
  });
  const page = (await (await fetch(`http://${ws.host}/json`)).json()).find((t) => t.type === "page");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  // Every call answers within 10 s, or fails: a stuck call must not hang the run.
  const send = (method, params = {}, ms = 10000) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP ${method} timed out`)); }, ms);
    pending.set(n, (result) => { clearTimeout(timer); resolve(result); });
    socket.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    try {
      return (await send("Runtime.evaluate", { expression, returnByValue: true, timeout: 5000 }))?.result?.value;
    } catch {
      return undefined; // a page mid-navigation; the caller polls again
    }
  };
  await send("Runtime.enable");
  return {
    evaluate,
    // A dev server's first request compiles the page: allow it as long as the other waits.
    navigate: (url) => send("Page.navigate", { url }, 120000),
    async until(expression, ms = 120000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await evaluate(expression)) return true;
        await delay(10);
      }
      return false;
    },
    close: async () => { socket.close(); child.kill(); await rm(profile, { recursive: true, force: true }).catch(() => {}); },
  };
}

// Cold start: launch → the home page's counter rendered in Chrome. Then the edit:
// change the counter's label, time until the new label shows, and whether it reloaded.
async function measureDev(dir, tool, chrome) {
  await clearCaches(dir, tool);
  const counterFile = join(dir, tool.counter);
  const original = await readFile(counterFile, "utf8");
  const port = PORT + 1;
  const started = performance.now();
  const server = launch(dir, tool.dev(port));
  try {
    const origin = `http://127.0.0.1:${port}`;
    if (!(await waitForHttp(origin))) throw new Error(`dev server did not answer: ${server.output().slice(-500)}`);
    await chrome.navigate(`${origin}/`);
    if (!(await chrome.until(`/Count:/.test(document.getElementById("counter")?.textContent ?? "")`))) {
      throw new Error(`dev page never rendered the counter: ${server.output().slice(-500)}`);
    }
    const coldStart = (performance.now() - started) / 1000;
    // Wait for the page to settle (hydration, HMR socket) before editing.
    await delay(1500);
    await chrome.evaluate("window.__benchMark = 1");
    const edited = performance.now();
    await writeFile(counterFile, original.replace(HMR_EDIT.from, HMR_EDIT.to));
    const updated = await chrome.until(`/${HMR_EDIT.to}/.test(document.getElementById("counter")?.textContent ?? "")`, 30000);
    const editToBrowser = (performance.now() - edited) / 1000;
    const reloaded = (await chrome.evaluate("window.__benchMark")) !== 1;
    return { coldStart, editToBrowser: updated ? editToBrowser : null, reloaded };
  } finally {
    await writeFile(counterFile, original);
    // Leave the app first: a dev client left open keeps reconnecting to the stopped
    // server and can stall the next navigation.
    await chrome.navigate("about:blank").catch(() => {});
    await server.stop();
  }
}

const measuredAt = new Date().toISOString().slice(0, 10);
const resultsFile = join(HERE, "results", `${measuredAt}.json`);
// The day's results so far: a rerun of some tools (--only) replaces just their entries.
const results = existsSync(resultsFile)
  ? JSON.parse(await readFile(resultsFile, "utf8"))
  : { measuredAt, runs: RUNS, sizes: SIZES, tools: {} };
const save = async () => {
  await mkdir(join(HERE, "results"), { recursive: true });
  await writeFile(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
};
await mkdir(join(WORK, "logs"), { recursive: true });
const chrome = await startChrome();
try {
  for (const id of ONLY) {
    const tool = TOOLS[id];
    const dir = await prepare(id);
    results.tools[id] = {};
    for (const k of SIZES) {
      log(`\n${id} — K=${k}`);
      try {
      await generate(tool.generator, dir, k);
      // A discarded warm-up build: measured runs then start with the files in the OS
      // page cache, so a cold disk read is never billed to a framework.
      await clearCaches(dir, tool);
      measureBuild(dir, tool, `${id}-k${k}-warmup`);
      const builds = [];
      for (let r = 1; r <= RUNS; r++) {
        await clearCaches(dir, tool);
        builds.push(measureBuild(dir, tool, `${id}-k${k}-r${r}`));
        log(`  build ${r}: ${builds.at(-1).peak_mb} MB, ${builds.at(-1).wall_s} s`);
      }
      // Parity against the production server of the last build.
      const server = launch(dir, tool.start(PORT));
      let failures;
      try {
        if (!(await waitForHttp(`http://127.0.0.1:${PORT}/`, 60000))) throw new Error(`server did not start: ${server.output().slice(-500)}`);
        failures = await checkParity(`http://127.0.0.1:${PORT}`, k);
      } finally {
        await server.stop();
      }
      log(`  parity: ${failures.length ? `✗ ${failures.join("; ")}` : "✓"}`);
      const devs = [];
      for (let r = 1; r <= RUNS; r++) {
        devs.push(await measureDev(dir, tool, chrome));
        log(`  dev ${r}: start ${devs.at(-1).coldStart.toFixed(2)} s, edit ${devs.at(-1).editToBrowser?.toFixed(3) ?? "—"} s${devs.at(-1).reloaded ? " (reload)" : ""}`);
      }
      results.tools[id][k] = {
        parity: failures.length ? failures : true,
        buildMemoryMb: median(builds.map((b) => b.peak_mb)),
        buildSeconds: median(builds.map((b) => b.wall_s)),
        devStartSeconds: median(devs.map((d) => d.coldStart)),
        editToBrowserSeconds: devs.every((d) => d.editToBrowser !== null) ? median(devs.map((d) => d.editToBrowser)) : null,
        editReloads: devs.some((d) => d.reloaded),
        samples: { builds, devs },
      };
      } catch (error) {
        // One failing step is recorded and the run goes on.
        log(`  ✗ ${error.message}`);
        results.tools[id][k] = { error: error.message };
      }
      await save();
    }
  }
} finally {
  await chrome.close();
}
await save();
log(`\n→ ${resultsFile}`);
