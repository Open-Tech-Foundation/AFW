#!/usr/bin/env esdev
// Docs scale benchmark (see README.md): how a docs site's output grows with its page count.
// Needs the optimized compiler: `cargo build --release -p afw_cli`.
//
//   esdev benchmarks/docs-scale/run.mjs [--pages=1000] [--sections=10] [--dir=<path>]
//
// Scaffolds the `docs` starter from this checkout (`esdev create --from=packages/create-afw`),
// installs this checkout's packages into it, adds `--pages` generated pages split across
// `--sections` sidebar sections, builds it with `esdev build`, and reports what a page and
// the whole site weigh.
//
// The site is prepared in the repo's `.cache/` (a script's files stay inside its project),
// then copied to `--dir` (default ~/.cache/afw-docs-scale, a solid-state disk here) and
// built and measured there, by child processes: `esdev build` and `measure.mjs`.

import { copy, exists, file, mkdir, readDir, realPath, remove, write } from "runtime:fs";
import { join } from "runtime:path";
import { args, env, exit } from "runtime:process";
import { Command } from "runtime:system";

const option = (name, fallback) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const pages = Number(option("pages", "1000"));
const sections = Number(option("sections", "10"));
const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const staging = join(root, ".cache/afw-docs-scale");
const site = join(staging, `site-${pages}`);
const target = join(option("dir", `${env.HOME}/.cache/afw-docs-scale`), `site-${pages}`);
const esdev = env.ESDEV_BIN || "esdev";
const decoder = new TextDecoder();

async function run(program, argv, cwd, extraEnv = {}) {
  const started = performance.now();
  const result = await new Command(program, { args: argv, cwd, inheritEnv: true, env: extraEnv, stdout: "piped", stderr: "piped" }).output();
  const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  if (!result.success) {
    console.error(`✗ ${program} ${argv.join(" ")}\n${output}`);
    exit(1);
  }
  return { output, seconds: (performance.now() - started) / 1000 };
}

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readDir(from)) {
    const source = join(from, entry.name);
    if (entry.isDir) await copyTree(source, join(to, entry.name));
    else if (entry.isFile || entry.isSymlink) await copy(await realPath(source), join(to, entry.name));
  }
}

// A workspace package as it is published: its `files`, into the site's node_modules.
async function install(source, name) {
  const manifest = await file(join(source, "package.json")).json();
  const dest = join(site, "node_modules", name);
  await remove(dest, { recursive: true }).catch(() => {});
  await mkdir(dest, { recursive: true });
  await copy(join(source, "package.json"), join(dest, "package.json"));
  for (const path of manifest.files ?? []) {
    if (path.startsWith("!") || path === "bin") continue;
    const from = join(source, path);
    if (!(await exists(from))) continue;
    const isDir = (await readDir(from).then(() => true, () => false));
    if (isDir) await copyTree(from, join(dest, path));
    else {
      await mkdir(join(dest, path, ".."), { recursive: true });
      await copy(from, join(dest, path));
    }
  }
}

if (!(await exists(join(root, "target/release/afwc")))) {
  console.error("✗ no target/release/afwc: run `cargo build --release -p afw_cli` first");
  exit(1);
}

// 1. The docs starter, scaffolded fresh.
await remove(site, { recursive: true }).catch(() => {});
await mkdir(staging, { recursive: true });
await run(esdev, ["create", site, `--from=${root}/packages/create-afw`, "--template=docs", "--no-blog", "--language=js", "--package-manager=pnpm", "--no-install", "-y"], staging);

// 2. This checkout's packages, and the registry packages they import.
for (const name of ["afw", "afw-build", "afw-cli", "afw-compiler", "afw-docs", "esdev-plugin-afw"]) {
  await install(join(root, "packages", name), `@opentf/${name}`);
}
for (const [from, name] of [["afw", "serialize"], ["afw-docs", "syntax-highlighter"]]) {
  await copyTree(await realPath(join(root, "packages", from, "node_modules/@opentf", name)), join(site, "node_modules/@opentf", name));
}

// 3. The pages: `sections` sidebar sections, each a page with `pages / sections` children.
const meta = {};
const perSection = Math.ceil(pages / sections);
for (let s = 0; s < sections; s++) {
  const folder = `section-${String(s).padStart(2, "0")}`;
  meta[folder] = `Section ${s}`;
  await mkdir(join(site, "app/docs", folder), { recursive: true });
  await write(join(site, "app/docs", folder, "page.mdx"), `---\ntitle: Section ${s}\n---\n\n# Section ${s}\n`);
  for (let i = 0; i < perSection && s * perSection + i < pages; i++) {
    const page = join(site, "app/docs", folder, `page-${String(i).padStart(3, "0")}`);
    await mkdir(page, { recursive: true });
    await write(join(page, "page.mdx"), `---\ntitle: Page ${s}.${i}\n---\n\n# Page ${s}.${i}\n\nSome text for page ${i} of section ${s}.\n`);
  }
}
const existing = await import(`file://${join(site, "app/docs/_meta.js")}`).then((m) => m.default, () => ({}));
await write(join(site, "app/docs/_meta.js"), `export default ${JSON.stringify({ ...existing, ...meta }, null, 2)};\n`);

// 4. Onto the solid-state disk, then the build and the measurement there.
await copy(join(root, "benchmarks/docs-scale/measure.mjs"), join(site, "measure.mjs"));
await run("rm", ["-rf", target], root);
await run("mkdir", ["-p", join(target, "..")], root);
await run("cp", ["-a", site, target], root);
await remove(site, { recursive: true });
// The optimized compiler, as published packages ship it: the debug build's search indexing
// alone is about 14 times slower, which would swamp the build time.
const build = await run(esdev, ["build"], target, { AFWC_BIN: join(root, "target/release/afwc") });
// "✅ Search index — 1013 page(s)  187.8s" (or "293ms" for a small site).
const searchTime = /Search index — \d+ page\(s\)\s+([\d.]+)(ms|s)\b/.exec(build.output);
const searchSeconds = searchTime ? Number(searchTime[1]) / (searchTime[2] === "ms" ? 1000 : 1) : NaN;
const measured = await run(esdev, ["measure.mjs", `--sections=${sections}`, `--per-section=${perSection}`], target);
console.log(measured.output.trim());
console.log(`| build | ${build.seconds.toFixed(1)} s (search index ${searchSeconds.toFixed(1)} s) |`);
console.log(`\nsite: ${target}`);
