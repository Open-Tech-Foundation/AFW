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

for (const language of ["ts", "js"]) {
  for (const template of ["spa", "fullstack", "ssr", "ssg"]) {
    describe(`${template} (${language})`, () => {
      const root = join(scratch, `${template}-${language}`);

      test("scaffolds a project on the workspace's AFW versions", async () => {
        const { files } = await create({ directory: root, template, language });
        const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        assert.equal(manifest.name, `${template}-${language}`);
        assert.match(manifest.dependencies["@opentf/afw"], /^\^\d+\.\d+\.\d+/);
        assert.ok(files.includes(`app/page.${language}x`));
        assert.equal(files.includes(`app/api/hello/route.${language}`), template === "fullstack" || template === "ssr");
        assert.equal(files.includes("tsconfig.json"), language === "ts");
      });

      test("its tests pass under Vitest", async () => {
        const result = await runTests(root);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.states, ["counts clicks: pass"]);
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
        if (template === "spa") {
          assert.ok(await exists(join(root, "dist", "index.html")));
        } else if (template === "ssg") {
          assert.match(await readFile(join(root, "dist", "about", "index.html"), "utf8"), /This page is Markdown/);
        } else {
          const { child, origin } = startServer(root);
          try {
            const url = await origin;
            const api = await fetch(`${url}/api/hello?name=Ada`);
            assert.equal((await api.json()).message, "Hello, Ada!");
            assert.match(api.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
            assert.deepEqual((await (await fetch(`${url}/todos/__data.json`)).json()).todos.length, 3);
            const page = await (await fetch(`${url}/todos`, { headers: html })).text();
            if (template === "ssr") assert.match(page, /Try the dev server/, "the page is server-rendered");
            else assert.match(page, /<div id="app"><\/div>/);
          } finally {
            child.kill();
          }
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
    assert.deepEqual(parseArgs(["my-app", "--template", "ssr-js", "--overwrite", "--no-interactive"]), {
      directory: "my-app", template: "ssr", language: "js", overwrite: true, install: true, interactive: false, help: false,
    });
    assert.equal(parseArgs(["--no-install"]).install, false);
    assert.throws(() => parseArgs(["--immediate"]), /Unknown option/);
    assert.equal(parseArgs(["-t", "fullstack"]).template, "fullstack");
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
    const { stdout } = await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--template", "fullstack-js", "--no-interactive", "--no-install"], {
      env: { ...process.env, npm_config_user_agent: "pnpm/11" },
    });
    assert.match(stdout, /Scaffolding fullstack \(JavaScript\)/);
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
  test("name, arrow-key template and language, then next steps", async () => {
    const cwd = join(scratch, "tty-flow");
    await mkdir(cwd, { recursive: true });
    const npm = await fakeNpm(0);
    const tty = terminal(cwd, npm.env);
    await tty.until("Project name:"); tty.type(`my-app${KEY.enter}`);
    await tty.until("Select a template:"); tty.type(`${KEY.down}${KEY.down}${KEY.enter}`);
    await tty.until("Select a language:"); tty.type(`${KEY.down}${KEY.enter}`);
    await tty.until("Done. Now run:");
    await tty.exited();
    assert.match(tty.plain(), /Installingdependencieswithnpm/);
    assert.deepEqual(await npm.calls(), ["install"], "installed, and the dev server was not started");
    assert.match(tty.plain(), /Nowrun:cdmy-appnpmrundev/);
    const manifest = JSON.parse(await readFile(join(cwd, "my-app", "package.json"), "utf8"));
    assert.equal(manifest.name, "my-app");
    assert.ok(await exists(join(cwd, "my-app", "app", "api", "hello", "route.js")), "the third template, ssr");
    assert.ok(!(await exists(join(cwd, "my-app", "tsconfig.json"))), "JavaScript");
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
    await tty.until("Select a language:"); tty.type(KEY.enter);
    await tty.until("Done. Now run:");
    await tty.exited();
    assert.ok(!(await exists(join(cwd, "My App", "old.txt"))));
    assert.equal(JSON.parse(await readFile(join(cwd, "My App", "package.json"), "utf8")).name, "my-app");
    assert.ok(await exists(join(cwd, "My App", "tsconfig.json")), "TypeScript by default");
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
