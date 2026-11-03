// Scaffold every template in both languages, then do what a new user does: build,
// test, typecheck, and run the result.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { startVitest } from "vitest/node";

import { create, packageManager, parseArgs } from "@opentf/create-afw";

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

describe("command line", () => {
  test("parses options and rejects bad ones", () => {
    assert.deepEqual(parseArgs(["my-app", "--template=ssr", "--language=js", "-y"]), {
      directory: "my-app", template: "ssr", language: "js", yes: true, help: false,
    });
    assert.equal(parseArgs(["--ts"]).language, "ts");
    assert.throws(() => parseArgs(["--template=nope"]), /Unknown template "nope"/);
    assert.throws(() => parseArgs(["--language=go"]), /Unknown language/);
    assert.throws(() => parseArgs(["--bogus"]), /Unknown option/);
  });

  test("refuses a non-empty directory and an invalid name", async () => {
    const dir = join(scratch, "taken");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep.txt"), "x");
    await assert.rejects(create({ directory: dir }), /is not empty/);
    await assert.rejects(create({ directory: join(scratch, "Bad Name") }), /not a valid package name/);
  });

  test("detects the package manager that ran it", () => {
    assert.equal(packageManager("pnpm/11.21.0 npm/? node/v26"), "pnpm");
    assert.equal(packageManager("npm/11.0.0 node/v26"), "npm");
    assert.equal(packageManager(""), "npm");
  });

  test("runs end to end as a CLI", async () => {
    const dir = join(scratch, "from-cli");
    const { stdout } = await promisify(execFile)(process.execPath, [join(pkg, "index.js"), dir, "--template=fullstack", "--js", "--yes"], {
      env: { ...process.env, npm_config_user_agent: "pnpm/11" },
    });
    assert.match(stdout, /Created fullstack app/);
    assert.match(stdout, /pnpm install\n  pnpm dev/);
    assert.ok(await exists(join(dir, "app", "api", "hello", "route.js")));
  });
});
