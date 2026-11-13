// The esdev starters are generated from templates.js. Expanding them as esdev does
// must give exactly the files the shared source produces for every answer combination,
// so both workflows scaffold the same project.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESDEV_TEMPLATES, applyEsdevTemplate, combinations, esdevCatalog, esdevTemplate } from "../esdev-templates.js";
import { projectFiles } from "../templates.js";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const registry = (name) => `9.9.9-${name}`;
const versions = new Proxy({}, { get: (_, name) => (typeof name === "string" ? registry(name) : undefined) });

async function walk(dir) {
  const out = {};
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    out[relative(dir, file)] = await readFile(file, "utf8");
  }
  return out;
}

describe("generated esdev starters", () => {
  for (const name of Object.keys(ESDEV_TEMPLATES)) {
    test(`${name}: every combination expands to the shared source's files`, () => {
      const template = esdevTemplate(name);
      const combos = combinations(ESDEV_TEMPLATES[name].options);
      assert.ok(combos.length >= 2);
      for (const answers of combos) {
        const expected = projectFiles({
          name: "my-app", pm: "pnpm", versions, toolchain: "esdev", ...ESDEV_TEMPLATES[name].files(answers),
        });
        assert.deepEqual(applyEsdevTemplate(template, answers, { name: "my-app", pm: "pnpm", registry }), expected, JSON.stringify(answers));
      }
    });
  }

  test("the server question is asked only for client and static apps", () => {
    const combos = combinations(ESDEV_TEMPLATES.app.options);
    for (const render of ["server", "mixed"]) {
      assert.ok(combos.filter((c) => c.render === render).every((c) => c.server === "yes"), render);
    }
    for (const render of ["client", "static"]) {
      assert.deepEqual([...new Set(combos.filter((c) => c.render === render).map((c) => c.server))].sort(), ["no", "yes"]);
    }
  });

  test("files no answer changes sit in the base; overlays name the options that decide them", () => {
    const app = esdevTemplate("app");
    assert.ok("app/about/page.md" in app, "the same in every app");
    assert.ok("_gitignore" in app);
    assert.ok(Object.keys(app).some((p) => p.startsWith("_option/language/ts/")), "language alone decides some files");
    assert.ok(Object.keys(app).some((p) => /^_option\/[^/]+\/[^/]+\/_option\//.test(p)), "some need a combination, nested");
    assert.ok(!Object.keys(app).some((p) => p.includes("+")), "no + in any path");
    assert.ok(!Object.keys(app).some((p) => p.endsWith(".gitignore")));
    const json = JSON.parse(app["template.json"]);
    assert.equal(json.group, "AFW");
    assert.deepEqual(json.options.map((o) => o.name), ["render", "server", "styling", "language"]);
  });

  test("the committed esdev/templates is what the generator writes", async () => {
    const written = await walk(join(pkg, "esdev", "templates"));
    const expected = { "catalog.json": esdevCatalog() };
    for (const name of Object.keys(ESDEV_TEMPLATES)) {
      for (const [path, contents] of Object.entries(esdevTemplate(name))) expected[`${name}/${path}`] = contents;
    }
    assert.deepEqual(Object.keys(written).sort(), Object.keys(expected).sort(), "run `node scripts/write-esdev-templates.mjs`");
    for (const path of Object.keys(expected)) assert.equal(written[path], expected[path], path);
  });
});
