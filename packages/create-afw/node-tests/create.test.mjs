// Scaffold every template in both languages, then do what a new user does: build,
// test, typecheck, and run the result.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import { startVitest } from "vitest/node";

import { create, nextSteps, packageManager, parseArgs, toValidPackageName } from "@opentf/create-afw";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(dirname(pkg));
const exists = (p) => access(p).then(() => true, () => false);
const html = { accept: "text/html" };

await mkdir(join(pkg, ".cache"), { recursive: true });
const scratch = await mkdtemp(join(pkg, ".cache", "projects-"));
after(() => rm(scratch, { recursive: true, force: true }));

async function runTests(root) {
  const vitest = await startVitest("test", [], { root, run: true, watch: false, reporters: [] });
  try {
    const files = vitest.state.getFiles();
    return {
      errors: files.flatMap((f) => f.result?.errors ?? []).map((e) => e.message),
      states: files.flatMap((f) => f.tasks).map((t) => `${t.name}: ${t.result?.state}`),
    };
  } finally {
    await vitest.close();
  }
}

function startServer(root) {
  const child = spawn(process.execPath, ["dist/server/index.js"], { cwd: root, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
  const origin = new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (c) => { out += c; const m = out.match(/listening on (http:\/\/\S+)/); if (m) resolve(m[1]); });
    child.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
  return { child, origin };
}

// Every rendering × server combination of the app, both stylings, docs and library.
const CASES = [
  { template: "app", render: "spa", server: false, styling: "css" },
  { template: "app", render: "spa", server: false, styling: "tailwind" },
  { template: "app", render: "spa", server: true, styling: "css" },
  { template: "app", render: "ssr", server: true, styling: "tailwind" },
  { template: "app", render: "ssg", server: false, styling: "css" },
  { template: "app", render: "ssg", server: true, styling: "tailwind" },
  { template: "docs" },
  { template: "library", styling: "css" },
  { template: "library", styling: "tailwind" },
];
const label = (c) => [c.template, c.render, c.server && "server", c.styling].filter(Boolean).join("-");

async function builtCss(dir) {
  const assets = join(dir, "assets");
  return (await Promise.all((await readdir(assets)).filter((f) => f.endsWith(".css")).map((f) => readFile(join(assets, f), "utf8")))).join("\n");
}

for (const language of ["ts", "js"]) {
  for (const options of CASES) {
    const { template, render, server, styling } = options;
    const name = `${label(options)}-${language}`;
    describe(`${name}`, () => {
      const root = join(scratch, name);

      test("scaffolds a project on the workspace's AFW versions", async () => {
        const { files } = await create({ directory: root, ...options, language });
        const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        assert.equal(manifest.name, name);
        const afwRange = template === "library" ? manifest.peerDependencies["@opentf/afw"] : manifest.dependencies["@opentf/afw"];
        assert.match(afwRange, /^\^\d+\.\d+\.\d+/);
        assert.equal(files.includes("tsconfig.json"), language === "ts");
        assert.equal(files.includes(`app/api/hello/route.${language}`), !!server);
        assert.equal(files.includes(`app/todos/todos.server.${language}`), !!server);
        assert.equal("tailwindcss" in manifest.devDependencies, styling === "tailwind");
        if (template === "docs") assert.ok(manifest.dependencies["@opentf/afw-docs"]);
        if (template === "library") {
          assert.deepEqual(manifest.files, [`index.${language}`, "src"]);
          assert.equal(manifest.private, undefined, "a library is publishable");
        }
      });

      test("its tests pass under Vitest", async () => {
        const result = await runTests(root);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.states, [template === "docs" ? "the home page links to the docs and the blog: pass" : "counts clicks: pass"]);
      });

      if (language === "ts") {
        test("it typechecks", async () => {
          const tsc = join(repo, "node_modules", "typescript", "bin", "tsc");
          try {
            await promisify(execFile)(process.execPath, [tsc, "-p", root]);
          } catch (e) {
            assert.fail(`${e.stdout}${e.stderr}`);
          }
        });
      }

      test("it builds and runs", async () => {
        // Exactly what \`npm run build\` runs.
        await promisify(execFile)(process.execPath, [join(pkg, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "error"], { cwd: root });
        const dist = join(root, "dist");
        const client = server ? join(dist, "client") : dist;
        if (styling === "tailwind") assert.match(await builtCss(client), /\.bg-sky-600/, "Tailwind generated the classes the components use");
        if (template === "docs") {
          assert.match(await readFile(join(dist, "docs", "index.html"), "utf8"), /Introduction/);
          assert.match(await readFile(join(dist, "docs", "guides", "writing-pages", "index.html"), "utf8"), /Writing Pages/);
          assert.match(await readFile(join(dist, "blog", "rss.xml"), "utf8"), /Hello, world/);
          assert.ok(await exists(join(dist, "_search", "manifest.json")), "the search index");
          assert.ok(await exists(join(dist, "llms.txt")));
          return;
        }
        if (!server) {
          assert.ok(!(await exists(join(dist, "server"))), "no server without one");
          if (render === "ssg") assert.match(await readFile(join(dist, "about", "index.html"), "utf8"), /This page is Markdown/);
          else assert.ok(await exists(join(dist, "index.html")));
          return;
        }
        const { child, origin } = startServer(root);
        try {
          const url = await origin;
          const api = await fetch(`${url}/api/hello?name=Ada`);
          assert.equal((await api.json()).message, "Hello, Ada!");
          assert.match(api.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
          assert.deepEqual((await (await fetch(`${url}/todos/__data.json`)).json()).todos.length, 3);
          const page = await (await fetch(`${url}/todos`, { headers: html })).text();
          if (render === "spa") assert.match(page, /<div id="app"><\/div>/);
          else assert.match(page, /Try the dev server/, "the page's HTML has its loader data");
          // The page's server function, called as its browser stub calls it.
          const assets = join(client, "assets");
          const code = (await Promise.all((await readdir(assets)).filter((f) => f.endsWith(".js")).map((f) => readFile(join(assets, f), "utf8")))).join("\n");
          const endpoints = [...new Set(code.match(/\/todos\/__fn\/[0-9a-f]{16}/g) ?? [])];
          assert.ok(endpoints.length, "the client bundle calls the server functions");
          // The action answers with the list it added to; a query ignores the title.
          const answers = await Promise.all(endpoints.map(async (endpoint) => {
            const res = await fetch(`${url}${endpoint}`, { method: "POST", headers: { origin: url, "content-type": "application/json" }, body: '{"v":{"title":"Ship it"}}' });
            return res.status === 200 ? (await res.json()).v : null;
          }));
          assert.ok(answers.some((list) => list?.at(-1) === "Ship it"), JSON.stringify(answers));
        } finally {
          child.kill();
        }
      });
    });
  }
}

// A fake \`npm\` first on PATH: records each call, and exits with \`code\`.
async function fakeNpm(code = 0) {
  const bin = await mkdtemp(join(scratch, "fake-npm-"));
  const log = join(bin, "calls.log");
  await writeFile(join(bin, "npm"), `#!/bin/sh\necho "$@" >> "${log}"\nexit ${code}\n`, { mode: 0o755 });
  return { env: { PATH: `${bin}:${process.env.PATH}`, npm_config_user_agent: "npm/11" }, calls: async () => (await exists(log) ? (await readFile(log, "utf8")).trim().split("\n") : []) };
}

describe("command line", () => {
  test("parses options, including template-language names, and rejects bad ones", () => {
    assert.deepEqual(parseArgs(["my-app", "--template", "app-js", "--render", "ssg", "--server", "--tailwind", "--overwrite", "--no-interactive"]), {
      directory: "my-app", template: "app", render: "ssg", server: true, styling: "tailwind", language: "js",
      overwrite: true, install: true, interactive: false, help: false,
    });
    assert.deepEqual(parseArgs(["-t", "library", "-s", "css"]).styling, "css");
    // The template names of earlier releases still work, as app shorthands.
    const legacy = (args) => { const o = parseArgs(args); return [o.template, o.render, o.server]; };
    assert.deepEqual(legacy(["-t", "fullstack"]), ["app", "spa", true]);
    assert.deepEqual(legacy(["-t", "ssr-ts"]), ["app", "ssr", true]);
    assert.deepEqual(legacy(["-t", "ssg"]), ["app", "ssg", false]);
    assert.deepEqual(legacy(["-t", "ssg", "--server"]), ["app", "ssg", true]);
    assert.throws(() => parseArgs(["-t", "fullstack", "--no-server"]), /conflicts with --no-server/);
    assert.throws(() => parseArgs(["-t", "ssr", "--render", "spa"]), /conflicts with --render spa/);
    assert.throws(() => parseArgs(["--render", "ssr", "--no-server"]), /always has a server/);
    assert.throws(() => parseArgs(["-t", "docs", "--render", "ssr"]), /applies to the app template/);
    assert.throws(() => parseArgs(["-t", "library", "--server"]), /applies to the app template/);
    assert.throws(() => parseArgs(["-t", "docs", "--tailwind"]), /afw-docs theme/);
    assert.throws(() => parseArgs(["--render", "isr"]), /Unknown rendering/);
    assert.throws(() => parseArgs(["--styling", "sass"]), /Unknown styling/);
    assert.equal(parseArgs(["--no-install"]).install, false);
    assert.throws(() => parseArgs(["--immediate"]), /Unknown option/);
    assert.equal(parseArgs(["--template=spa-ts"]).language, "ts");
    assert.equal(parseArgs(["--js"]).language, "js");
    assert.throws(() => parseArgs(["--template=nope"]), /Unknown template "nope"/);
    assert.throws(() => parseArgs(["--template=ssr-ts", "--language=js"]), /conflicts/);
    assert.throws(() => parseArgs(["--language=go"]), /Unknown language/);
    assert.throws(() => parseArgs(["--template"]), /needs a value/);
    assert.throws(() => parseArgs(["--bogus"]), /Unknown option/);
  });

  test("a non-empty directory is refused, removed, or written beside", async () => {
    const dir = join(scratch, "taken");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep.txt"), "x");
    await assert.rejects(create({ directory: dir }), /is not empty/);
    await create({ directory: dir, existing: "ignore" });
    assert.ok(await exists(join(dir, "keep.txt")) && await exists(join(dir, "package.json")));
    await create({ directory: dir, existing: "remove" });
    assert.ok(!(await exists(join(dir, "keep.txt"))));
    await assert.rejects(create({ directory: join(scratch, "Bad Name") }), /not a valid package name/);
    assert.equal(toValidPackageName("My Cool App!"), "my-cool-app");
  });

  test("detects the package manager that ran it", () => {
    assert.equal(packageManager("pnpm/11.21.0 npm/? node/v26"), "pnpm");
    assert.equal(packageManager("npm/11.0.0 node/v26"), "npm");
    assert.equal(packageManager(""), "npm");
    assert.deepEqual(nextSteps({ directory: "my-app", pm: "pnpm" }), ["cd my-app", "pnpm install", "pnpm dev"]);
    assert.deepEqual(nextSteps({ directory: ".", pm: "npm" }), ["npm install", "npm run dev"]);
    assert.deepEqual(nextSteps({ directory: "my-app", pm: "npm", installed: true }), ["cd my-app", "npm run dev"]);
  });

  test("runs non-interactively with flags", async () => {
    const dir = join(scratch, "from-cli");
    const { stdout } = await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--template", "app-js", "--server", "--tailwind", "--no-interactive", "--no-install"], {
      env: { ...process.env, npm_config_user_agent: "pnpm/11" },
    });
    assert.match(stdout, /Scaffolding app \(spa, server, Tailwind CSS, JavaScript\)/);
    assert.match(stdout, /pnpm install\s+pnpm dev/);
    assert.ok(await exists(join(dir, "app", "api", "hello", "route.js")));
  });

  test("without --overwrite, a non-interactive run refuses a non-empty directory", async () => {
    const dir = join(scratch, "occupied");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep.txt"), "x");
    await assert.rejects(promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--no-interactive", "--no-install"]), (error) => {
      assert.equal(error.code, 1);
      assert.match(`${error.stdout}${error.stderr}`, /is not empty\. Use --overwrite/);
      return true;
    });
    await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--no-interactive", "--overwrite", "--no-install"]);
    assert.ok(!(await exists(join(dir, "keep.txt"))) && await exists(join(dir, "package.json")));
  });
});

describe("installing dependencies", { skip: process.platform === "win32" && "the fake npm is a shell script" }, () => {
  test("installs with the package manager that ran it, and never starts the dev server", async () => {
    const npm = await fakeNpm(0);
    const dir = join(scratch, "installs");
    const { stdout } = await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--no-interactive"], { env: { ...process.env, ...npm.env } });
    assert.deepEqual(await npm.calls(), ["install"], "only `npm install` ran");
    assert.match(stdout, /Installing dependencies with npm/);
    assert.match(stdout, /Done\. Now run:\s+cd \S+installs\s+npm run dev/);
    assert.doesNotMatch(stdout, /npm install\s+npm run dev/, "install is not repeated in the next steps");
  });

  test("a failed install warns and leaves the install step in the next steps", async () => {
    const npm = await fakeNpm(1);
    const dir = join(scratch, "install-fails");
    const { stdout } = await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--no-interactive"], { env: { ...process.env, ...npm.env } });
    assert.deepEqual(await npm.calls(), ["install"]);
    assert.match(stdout, /npm install failed; run it yourself/);
    assert.match(stdout, /npm install\s+npm run dev/);
    assert.ok(await exists(join(dir, "package.json")), "the project is still scaffolded");
  });

  test("--no-install skips it", async () => {
    const npm = await fakeNpm(0);
    await promisify(execFile)(process.execPath, [join(pkg, "index.js"), join(scratch, "no-install"), "--no-interactive", "--no-install"], { env: { ...process.env, ...npm.env } });
    assert.deepEqual(await npm.calls(), []);
  });
});

// The interactive prompts, driven through a real pseudo-terminal (`script`, util-linux).
const KEY = { enter: "\r", down: "\x1b[B", ctrlC: "\x03" };
// Synchronous on purpose: a top-level await here would register these tests after the
// file's root suite finished, and its \`after\` cleanup would delete their folders.
const hasScript = process.platform === "linux" && existsSync("/usr/bin/script");

function terminal(cwd, extraEnv = {}) {
  const child = spawn("script", ["-qec", `stty cols 120 rows 40; ${JSON.stringify(process.execPath)} ${JSON.stringify(join(pkg, "index.js"))}`, "/dev/null"], {
    cwd, env: { ...process.env, TERM: "xterm-256color", npm_config_user_agent: "npm/11", CI: "", ...extraEnv },
  });
  let screen = "";
  child.stdout.on("data", (d) => { screen += d; });
  const plain = () => screen.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\s+/g, "");
  return {
    async until(text, ms = 10000) {
      const want = text.replace(/\s+/g, "");
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (plain().includes(want)) return;
        await delay(40);
      }
      throw new Error(`timed out waiting for "${text}"; screen: ${plain().slice(-300)}`);
    },
    type: (keys) => child.stdin.write(keys),
    // \`exit\`, not \`close\`: the input pipe stays open for typing, so \`close\` never comes.
    exited: () => new Promise((done) => {
      const finish = () => { child.stdin.end(); done(); };
      if (child.exitCode !== null) finish();
      else child.once("exit", finish);
    }),
    plain,
  };
}

describe("interactive prompts", { skip: !hasScript && "needs util-linux script" }, () => {
  test("name, template, rendering, styling and language, then next steps", async () => {
    const cwd = join(scratch, "tty-flow");
    await mkdir(cwd, { recursive: true });
    const npm = await fakeNpm(0);
    const tty = terminal(cwd, npm.env);
    await tty.until("Project name:"); tty.type(`my-app${KEY.enter}`);
    await tty.until("Select a template:"); tty.type(KEY.enter); // app
    await tty.until("How should pages render?"); tty.type(`${KEY.down}${KEY.enter}`); // ssr: no server question
    await tty.until("Select a styling:"); tty.type(`${KEY.down}${KEY.enter}`); // Tailwind CSS
    await tty.until("Select a language:"); tty.type(`${KEY.down}${KEY.enter}`);
    await tty.until("Done. Now run:");
    await tty.exited();
    assert.match(tty.plain(), /Installingdependencieswithnpm/);
    assert.deepEqual(await npm.calls(), ["install"], "installed, and the dev server was not started");
    assert.match(tty.plain(), /Nowrun:cdmy-appnpmrundev/);
    const manifest = JSON.parse(await readFile(join(cwd, "my-app", "package.json"), "utf8"));
    assert.equal(manifest.name, "my-app");
    assert.ok(await exists(join(cwd, "my-app", "app", "api", "hello", "route.js")), "ssr, with its server");
    assert.ok("tailwindcss" in manifest.devDependencies, "Tailwind CSS");
    assert.ok(!(await exists(join(cwd, "my-app", "tsconfig.json"))), "JavaScript");
    assert.doesNotMatch(tty.plain(), /Addaserver\?/, "SSR does not ask about a server");
  });

  test("asks how to handle a non-empty directory, and for a valid package name", async () => {
    const cwd = join(scratch, "tty-existing");
    await mkdir(join(cwd, "My App"), { recursive: true });
    await writeFile(join(cwd, "My App", "old.txt"), "x");
    const tty = terminal(cwd, (await fakeNpm(0)).env);
    await tty.until("Project name:"); tty.type(`My App${KEY.enter}`);
    await tty.until("is not empty. How do you want to continue?"); tty.type(`${KEY.down}${KEY.enter}`); // Remove
    await tty.until("Package name:"); tty.type(KEY.enter); // accept the suggested my-app
    await tty.until("Select a template:"); tty.type(KEY.enter);
    await tty.until("How should pages render?"); tty.type(KEY.enter); // spa
    await tty.until("Add a server?"); tty.type(KEY.enter); // the default: no
    await tty.until("Select a styling:"); tty.type(KEY.enter);
    await tty.until("Select a language:"); tty.type(KEY.enter);
    await tty.until("Done. Now run:");
    await tty.exited();
    assert.ok(!(await exists(join(cwd, "My App", "old.txt"))));
    assert.equal(JSON.parse(await readFile(join(cwd, "My App", "package.json"), "utf8")).name, "my-app");
    assert.ok(await exists(join(cwd, "My App", "tsconfig.json")), "TypeScript by default");
    assert.ok(!(await exists(join(cwd, "My App", "app", "api"))), "no server by default");
  });

  test("the docs template asks only for the language", async () => {
    const cwd = join(scratch, "tty-docs");
    await mkdir(cwd, { recursive: true });
    const tty = terminal(cwd, (await fakeNpm(0)).env);
    await tty.until("Project name:"); tty.type(`my-docs${KEY.enter}`);
    await tty.until("Select a template:"); tty.type(`${KEY.down}${KEY.enter}`); // docs
    await tty.until("Select a language:"); tty.type(KEY.enter);
    await tty.until("Done. Now run:");
    await tty.exited();
    assert.doesNotMatch(tty.plain(), /Howshouldpagesrender|Addaserver|Selectastyling/);
    assert.ok(await exists(join(cwd, "my-docs", "afw.config.js")));
  });

  test("Ctrl+C cancels without writing anything", async () => {
    const cwd = join(scratch, "tty-cancel");
    await mkdir(cwd, { recursive: true });
    const tty = terminal(cwd);
    await tty.until("Project name:"); tty.type(`half${KEY.ctrlC}`);
    await tty.until("Operation cancelled.");
    await tty.exited();
    assert.deepEqual(await readdir(cwd), []);
  });
});
