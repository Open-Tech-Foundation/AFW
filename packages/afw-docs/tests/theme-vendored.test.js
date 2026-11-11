// The theme ships @opentf/syntax-highlighter's shared stylesheet as a copy
// (theme/syntax-highlighter.css): it must stay identical to the dependency's.
import { expect, test } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

const pkg = dirname(dirname(fromFileURL(import.meta.url)));

test("the vendored highlighter stylesheet matches the installed dependency", async () => {
  const manifest = await file(join(pkg, "package.json")).json();
  const dep = join(pkg, "node_modules/@opentf/syntax-highlighter");
  const installed = await file(join(dep, "package.json")).json();
  expect(installed.version).toBe(manifest.dependencies["@opentf/syntax-highlighter"]);
  const copy = await file(join(pkg, "theme/syntax-highlighter.css")).text();
  expect(copy).toContain(`@opentf/syntax-highlighter ${installed.version}`);
  const body = copy.slice(copy.indexOf("*/\n") + 3);
  expect(body).toBe(await file(join(dep, "src/themes/shared.css")).text());
});

test("the theme imports no stylesheet from another package", async () => {
  const css = await file(join(pkg, "theme/index.css")).text();
  const imports = [...css.matchAll(/^@import\s+"([^"]+)"/gm)].map((m) => m[1]);
  expect(imports.every((path) => path.startsWith("./"))).toBe(true);
});
