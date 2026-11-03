import { expect, test } from "runtime:test";
import { file, readDir } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

// The docs build modules run under esdev and under Vite; platform access comes from
// the installed host (build/host.js). Only the hosts and the two entry points may
// import `runtime:*` or `node:*`.
const PLATFORM_FILES = new Set(["index.js", "vite.js", "hosts/esdev.js", "hosts/node.js"]);

test("shared docs build modules import no runtime:* or node:* modules", async () => {
  const build = join(dirname(dirname(fromFileURL(import.meta.url))), "build");
  const offenders = [];
  for (const entry of await readDir(build)) {
    if (!entry.isFile || !entry.name.endsWith(".js") || PLATFORM_FILES.has(entry.name)) continue;
    const source = await file(join(build, entry.name)).text();
    for (const m of source.matchAll(/(?:^|[\s;])(?:import|export)\b[^"'`]*?["'`]((?:runtime|node):[^"'`]+)["'`]|import\(\s*["'`]((?:runtime|node):[^"'`]+)["'`]/gm)) {
      offenders.push(`${entry.name}: ${m[1] ?? m[2]}`);
    }
  }
  expect(offenders).toEqual([]);
});
