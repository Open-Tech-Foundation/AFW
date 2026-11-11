// Importing one component from the `@opentf/afw-docs` barrel bundles that component and
// what it renders — not the whole library. Compiled components register on the first read
// of their `.tag` (no import-time side effect), so the bundler drops what is never used.
import { afterAll, describe, expect, test } from "../../afw-cli/tests/harness.js";
import { build } from "runtime:build";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { closeCompilers, createAfwPlugin } from "../../esdev-plugin-afw/index.js";

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));
const barrel = join(root, "packages/afw-docs/index.js");

/** The component tags (unhashed) in a browser bundle of `source`. */
async function bundledComponents(source) {
  await mkdir(join(root, ".cache"), { recursive: true });
  const dir = await makeTempDir({ dir: join(root, ".cache"), prefix: ".afw-shake-" });
  try {
    const entry = join(dir, "page.jsx");
    await write(entry, source);
    const bundle = await build({
      input: entry,
      platform: "browser",
      external: [/^@opentf\/afw(\/|$)/],
      plugins: [createAfwPlugin({ target: "hydrate", failOnError: true })],
    });
    try {
      const { output } = await bundle.generate({ format: "esm" });
      const code = output.filter((o) => o.type === "chunk").map((c) => c.code).join("\n");
      return new Set([...code.matchAll(/"afw-([a-z-]+)-[0-9a-f]{8}"/g)].map((m) => m[1]));
    } finally {
      await bundle.close();
    }
  } finally {
    await remove(dir, { recursive: true });
  }
}

describe("tree-shaking the afw-docs barrel", () => {
  afterAll(closeCompilers);

  test("a Callout-only page bundles only the Callout", async () => {
    const tags = await bundledComponents(`import { Callout } from "${barrel}";\nexport default function Page() { return <Callout>x</Callout>; }\n`);
    expect([...tags]).toEqual(["callout"]);
  });

  test("a Navbar-only page bundles the navbar and what it renders, nothing else", async () => {
    const tags = await bundledComponents(`import { Navbar } from "${barrel}";\nexport default function Page() { return <Navbar config={{}} />; }\n`);
    for (const used of ["navbar", "navbar-link", "navbar-menu", "theme-toggle", "search-trigger", "search"]) {
      expect(tags.has(used)).toBe(true);
    }
    for (const unused of ["callout", "tabs", "steps", "sidebar", "toc", "docs-layout", "blog-layout", "post-list", "breadcrumbs"]) {
      expect(tags.has(unused)).toBe(false);
    }
  });
});
