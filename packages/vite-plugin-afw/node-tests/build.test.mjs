import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { build } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };

test("an SPA builds: compiled components, code-split routes, Markdown pages", async () => {
  const { dir, cleanup } = await copyFixture("spa");
  try {
    await build({ ...quiet, root: dir, plugins: [afw({ mode: "spa" })], build: { outDir: join(dir, "dist") } });
    const assets = await readdir(join(dir, "dist", "assets"));
    const js = await Promise.all(assets.filter((f) => f.endsWith(".js")).map((f) => readFile(join(dir, "dist", "assets", f), "utf8")));
    const all = js.join("\n");
    assert.ok(assets.filter((f) => f.startsWith("page-")).length >= 2, `route chunks: ${assets}`);
    assert.match(all, /customElements\.define/);
    assert.match(all, /Rendered from/);
    assert.doesNotMatch(all, /<button/);
    assert.doesNotMatch(all, /registerHot|import\.meta\.hot/, "release builds carry no refresh code");
    assert.match(await readFile(join(dir, "dist", "index.html"), "utf8"), /<script type="module"/);
  } finally {
    await cleanup();
  }
});

test("a compile error fails the build with the file and position", async () => {
  const { dir, cleanup } = await copyFixture("spa");
  try {
    await writeFile(join(dir, "app", "Counter.jsx"), "export default function Counter() {\n  return <button>;\n}\n");
    await assert.rejects(
      build({ ...quiet, root: dir, plugins: [afw()], build: { outDir: join(dir, "dist") } }),
      (e) => /Counter\.jsx/.test(`${e.id ?? ""} ${e.message}`),
    );
  } finally {
    await cleanup();
  }
});

test("draft pages are left out of release routes", async () => {
  const { dir, cleanup } = await copyFixture("spa");
  try {
    await writeFile(join(dir, "app", "about", "page.md"), "---\ndraft: true\n---\n# Secret draft\n");
    await build({ ...quiet, root: dir, plugins: [afw()], build: { outDir: join(dir, "dist") } });
    const assets = await readdir(join(dir, "dist", "assets"));
    const all = (await Promise.all(assets.map((f) => readFile(join(dir, "dist", "assets", f), "utf8")))).join("\n");
    assert.doesNotMatch(all, /Secret draft/);
  } finally {
    await cleanup();
  }
});

test("unknown options fail before anything starts", () => {
  assert.throws(() => afw({ mode: "isr" }), /Unknown AFW rendering mode/);
});
