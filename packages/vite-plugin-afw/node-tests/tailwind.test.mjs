// Tailwind CSS 4 with the AFW Vite plugin: the classes used in .jsx, .tsx and .mdx
// sources (string and object `class` values) reach the stylesheet, in dev and build.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import tailwindcss from "@tailwindcss/vite";
import { build, createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };
let dir, cleanup;

before(async () => {
  ({ dir, cleanup } = await copyFixture("spa"));
  await writeFile(join(dir, "app", "global.css"), '@import "tailwindcss";\n');
  await writeFile(join(dir, "entry.js"), `import "./app/global.css";\n${await readFile(join(dir, "entry.js"), "utf8")}`);
  await writeFile(join(dir, "app", "Counter.jsx"), `export default function Counter({ start = 0 }) {
  let count = $state(start);
  return <button id="counter" class="rounded-lg bg-sky-600 px-3" onclick={() => count++}>Count {count}</button>;
}
`);
  await writeFile(join(dir, "app", "Badge.tsx"), `export default function Badge({ label = "typed" }: { label?: string }) {
  let on = $state(true);
  return <span id="badge" class={{ "font-semibold": on, "text-rose-700": !on }}>{label.toUpperCase()}</span>;
}
`);
  await writeFile(join(dir, "app", "about", "page.md"), `---
title: About
---

<p class="tracking-widest">About</p>
`);
});
after(() => cleanup?.());

const plugins = () => [afw(), tailwindcss()];

test("a production build emits the classes used in components and pages", async () => {
  await build({ ...quiet, root: dir, plugins: plugins() });
  const assets = join(dir, "dist", "assets");
  const css = (await Promise.all((await readdir(assets)).filter((f) => f.endsWith(".css")).map((f) => readFile(join(assets, f), "utf8")))).join("\n");
  for (const cls of ["rounded-lg", "bg-sky-600", "px-3", "font-semibold", "text-rose-700", "tracking-widest"]) {
    assert.ok(css.includes(`.${cls}`), `.${cls} is in the stylesheet`);
  }
  assert.ok(!css.includes(".bg-lime-500"), "unused utilities are left out");
});

test("the dev server serves the generated utilities", async () => {
  const server = await createServer({ ...quiet, root: dir, plugins: plugins(), server: { port: 0 } });
  try {
    const css = (await server.transformRequest(`${join(dir, "app", "global.css")}?direct`)).code;
    assert.ok(css.includes(".bg-sky-600"));
    assert.ok(css.includes(".font-semibold"));
  } finally {
    await server.close();
  }
});
