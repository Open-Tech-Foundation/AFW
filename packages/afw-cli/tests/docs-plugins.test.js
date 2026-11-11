// `loadDocsPlugins` — the docs/blog bundler plugins the SSG prerender adds, resolved
// from the project's own `@opentf/afw-docs`.
import { expect, test } from "runtime:test";
import { dirname, fromFileURL, join } from "runtime:path";
import { loadDocsPlugins } from "../src/shared.js";

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));
const appDir = join(root, "app");

test("a docs or blog site gets the code-fence highlighter", async () => {
  for (const config of [{ docs: {} }, { blog: {} }]) {
    const names = (await loadDocsPlugins(root, appDir, config)).map((plugin) => plugin.name);
    expect(names).toContain("afw-docs-highlight");
  }
});

test("a plain app gets no docs plugins", async () => {
  expect(await loadDocsPlugins(root, appDir, {})).toEqual([]);
});
