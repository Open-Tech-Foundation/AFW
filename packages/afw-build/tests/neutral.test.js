import { expect, test } from "runtime:test";
import { file, readDir } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

// The shared build core runs on ES-Runtime and on Node; anything platform-specific
// comes from the host. A static `runtime:*` or `node:*` import would tie it to one.
test("the package imports no runtime:* or node:* modules", async () => {
  const pkg = dirname(dirname(fromFileURL(import.meta.url)));
  const manifest = await file(join(pkg, "package.json")).json();
  const offenders = [];
  for (const name of manifest.files) {
    const source = await file(join(pkg, name)).text();
    for (const m of source.matchAll(/(?:^|[\s;])(?:import|export)\b[^"'`]*?["'`]((?:runtime|node):[^"'`]+)["'`]|import\(\s*["'`]((?:runtime|node):[^"'`]+)["'`]/gm)) {
      offenders.push(`${name}: ${m[1] ?? m[2]}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("every source file is published", async () => {
  const pkg = dirname(dirname(fromFileURL(import.meta.url)));
  const manifest = await file(join(pkg, "package.json")).json();
  const sources = (await readDir(pkg)).filter((e) => e.isFile && e.name.endsWith(".js")).map((e) => e.name).sort();
  expect(sources).toEqual(manifest.files.filter((f) => f.endsWith(".js")).sort());
});
