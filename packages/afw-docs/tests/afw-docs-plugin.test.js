// `afwDocsPlugin`: the whole esdev docs toolchain as one `esdev.json` entry. It reads
// afw.config and returns the plugins the config enables (esdev 0.27+ takes a list from
// one entry), like `afwDocs()` on Vite.
import { afterAll, describe, expect, test } from "../../afw-cli/tests/harness.js";
import { copy, file, makeTempDir, mkdir, readDir, realPath, remove, stat, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { env } from "runtime:process";
import { Command } from "runtime:system";
import { afwDocsPlugin, loadDocsConfig } from "../build/index.js";

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));
const names = async (options) => (await afwDocsPlugin(options)).map((plugin) => plugin.name);

describe("afwDocsPlugin", () => {
  test("enables what the config asks for, and always highlights code fences", async () => {
    expect(await names({ config: {} })).toEqual(["afw-docs-highlight"]);
    expect(await names({ config: { docs: {} } })).toEqual(["afw-docs-nav", "afw-docs-highlight"]);
    expect(await names({ config: { blog: {} } })).toEqual(["afw-blog-posts", "afw-docs-highlight"]);
    expect(await names({ config: { docs: { lastUpdated: true }, blog: { dir: "news" } } }))
      .toEqual(["afw-docs-nav", "afw-blog-posts", "afw-last-updated", "afw-docs-highlight"]);
  });

  test("reads afw.config from the project root", async () => {
    await mkdir(join(root, ".cache"), { recursive: true });
    const dir = await makeTempDir({ dir: join(root, ".cache"), prefix: ".afw-docs-config-" });
    try {
      expect(await loadDocsConfig(dir)).toEqual({});
      await write(join(dir, "afw.config.js"), 'export default { docs: { title: "From JS" } };\n');
      expect((await loadDocsConfig(dir)).docs.title).toBe("From JS");
      await write(join(dir, "afw.config.json"), '{ "blog": {} }');
      expect(await loadDocsConfig(dir)).toEqual({ blog: {} }); // JSON wins, as in afw-cli
      expect(await names({ root: dir })).toEqual(["afw-blog-posts", "afw-docs-highlight"]);
    } finally {
      await remove(dir, { recursive: true });
    }
  });
});

// A docs site whose esdev.json has the single entry, built by the real `esdev build`.
// esdev resolves packages from the project's own node_modules, so the workspace packages
// are copied in as published (their `files`), as an installed project has them.
describe("one esdev.json entry", () => {
  let dir;
  afterAll(async () => { if (dir) await remove(dir, { recursive: true }); });

  async function copyPath(from, to) {
    if ((await stat(from)).isDir) {
      await mkdir(to, { recursive: true });
      for (const entry of await readDir(from)) await copyPath(join(from, entry.name), join(to, entry.name));
    } else {
      await mkdir(dirname(to), { recursive: true });
      await copy(from, to);
    }
  }
  async function install(source, name) {
    const manifest = await file(join(source, "package.json")).json();
    for (const path of ["package.json", ...manifest.files.filter((p) => !p.startsWith("!") && p !== "bin")]) {
      await copyPath(join(source, path), join(dir, "node_modules", name, path));
    }
  }

  test("builds the nav and highlights code with no other docs entries", async () => {
    await mkdir(join(root, ".cache"), { recursive: true });
    dir = await makeTempDir({ dir: join(root, ".cache"), prefix: ".afw-docs-entry-" });
    for (const name of ["afw", "afw-build", "afw-compiler", "afw-docs", "esdev-plugin-afw"]) {
      await install(join(root, "packages", name), `@opentf/${name}`);
    }
    for (const [from, name] of [["afw", "serialize"], ["afw-docs", "syntax-highlighter"]]) {
      await install(await realPath(join(root, "packages", from, "node_modules/@opentf", name)), `@opentf/${name}`);
    }
    await write(join(dir, "package.json"), '{ "type": "module" }');
    await write(join(dir, "afw.config.json"), '{ "site": { "url": "https://docs.example" }, "docs": { "title": "Probe" } }');
    await mkdir(join(dir, "app/docs/guide"), { recursive: true });
    await write(join(dir, "app/docs/page.mdx"), "---\ntitle: Intro\n---\n\n# Intro\n\n```js\nconst answer = 42;\n```\n");
    await write(join(dir, "app/docs/guide/page.mdx"), "---\ntitle: Guide\n---\n\n# Guide\n");
    await write(join(dir, "main.js"), [
      'import nav from "@opentf/afw-docs/nav";',
      'import Intro from "./app/docs/page.mdx";',
      "globalThis.__probe = { nav, Intro };",
    ].join("\n"));
    await write(join(dir, "esdev.json"), JSON.stringify({
      plugins: [
        { module: "@opentf/esdev-plugin-afw", options: { mode: "spa", appDir: "app" } },
        { module: "@opentf/afw-docs/build", export: "afwDocsPlugin", options: { appDir: "app" } },
      ],
      build: { targets: { web: { entry: "main.js", out: "out.js", platform: "browser" } } },
    }));
    const built = await new Command(env.ESDEV_BIN || "esdev", {
      args: ["build", "--sourcemap"], cwd: dir, inheritEnv: true, env: { AFWC_BIN: join(root, "target/debug/afwc") },
      stdout: "piped", stderr: "piped",
    }).output();
    if (!built.success) throw Error(new TextDecoder().decode(built.stderr));
    // Every transform, the highlighter included, hands the bundler a source map.
    expect(new TextDecoder().decode(built.stderr).includes("SOURCEMAP_BROKEN")).toBe(false);
    const out = await file(join(dir, "out.js")).text();
    // The generated navigation (afw-docs-nav) and a highlighted fence (afw-docs-highlight).
    expect(out.includes('"Guide"')).toBe(true);
    expect(/language-js\\?"><span class=\\?"sh-keyword/.test(out)).toBe(true);
  });
});
