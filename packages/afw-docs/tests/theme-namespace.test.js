// Guards the theme's two class namespaces (see the header of theme/index.css):
// `afw-<kebab>` is the host hook the compiler stamps on every component host, and
// `afwd-*` is the theme's own elements. If a component's element reuses a host hook
// name, the host and the element both match — the host rules (`display: contents`)
// then flatten the element too, which is how the navbar and sidebar lost their boxes.
import { describe, expect, test } from "../../afw-cli/tests/harness.js";
import { file, readDir } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

const PKG = join(dirname(fromFileURL(import.meta.url)), "..");
const COMPONENTS = join(PKG, "components");
const THEME = join(PKG, "theme", "index.css");

// Classes the compiler emits into MDX output and the search indexer reads; they are
// framework-owned, so they keep the `afw-` prefix.
const FRAMEWORK_CLASSES = new Set([
  "afw-code", "afw-code-head", "afw-code-lang", "afw-code-name", "afw-copy",
  "afw-copy-icon", "afw-copy-label", "afw-check-icon", "afw-heading-anchor",
  "afw-table-wrap", "afw-search-body", "afw-search-ignore", "afw-search-meta",
]);

const kebab = (name) => name.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();

async function components() {
  const out = [];
  for (const entry of await readDir(COMPONENTS)) {
    if (!entry.name.endsWith(".jsx")) continue;
    out.push({ name: entry.name, source: await file(join(COMPONENTS, entry.name)).text() });
  }
  return out;
}

async function hostHooks() {
  const hooks = new Set(["afw-link"]);
  for (const { source } of await components()) {
    for (const m of source.matchAll(/function\s+([A-Z]\w*)\s*\(/g)) hooks.add("afw-" + kebab(m[1]));
  }
  return hooks;
}

// Every class token a component writes: `class=`/`className=` strings and branches,
// classList calls, and selector strings handed to querySelector/closest.
function classTokens(source) {
  const tokens = new Set();
  const contexts = [
    ...source.matchAll(/class(?:Name)?=\{?([^>\n]*)/g),
    ...source.matchAll(/(?:querySelector(?:All)?|closest|classList\.\w+)\(([^)]*)\)/g),
  ];
  for (const [, text] of contexts) {
    for (const m of text.matchAll(/(?<![\w#-])\.?(afwd?-[a-z0-9-]*[a-z0-9])(?![\w-])/g)) tokens.add(m[1]);
  }
  return tokens;
}

describe("afw-docs theme class namespaces", () => {
  test("no component element reuses a component host hook", async () => {
    const hooks = await hostHooks();
    const clashes = [];
    for (const { name, source } of await components()) {
      for (const token of classTokens(source)) if (hooks.has(token)) clashes.push(`${name}: ${token}`);
    }
    expect(clashes).toEqual([]);
  });

  test("components write theme classes as afwd-*, not afw-*", async () => {
    const strays = [];
    for (const { name, source } of await components()) {
      for (const token of classTokens(source)) {
        if (token.startsWith("afw-") && !FRAMEWORK_CLASSES.has(token)) strays.push(`${name}: ${token}`);
      }
    }
    expect(strays).toEqual([]);
  });

  test("every afw-* selector in the theme is a host hook or a framework class", async () => {
    const hooks = await hostHooks();
    const css = (await file(THEME).text()).replace(/\/\*[\s\S]*?\*\//g, "");
    const unknown = new Set();
    for (const m of css.matchAll(/\.(afw-[a-z0-9-]*[a-z0-9])(?![\w-])/g)) {
      if (!hooks.has(m[1]) && !FRAMEWORK_CLASSES.has(m[1])) unknown.add(m[1]);
    }
    expect([...unknown]).toEqual([]);
  });

  test("the callout type modifier matches a themed afwd-callout-* rule", async () => {
    const css = await file(THEME).text();
    for (const type of ["note", "tip", "info", "warning", "danger"]) {
      expect(css.includes(`.afwd-callout-${type}`)).toBe(true);
    }
    const callout = await file(join(COMPONENTS, "Callout.jsx")).text();
    expect(callout.includes(`"afwd-callout afwd-callout-" + type`)).toBe(true);
  });
});
