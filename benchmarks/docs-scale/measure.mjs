#!/usr/bin/env esdev
// Run by run.mjs inside a built docs-scale site: what its docs pages weigh.
//
//   esdev measure.mjs --sections=10 --per-section=100

import { file, readDir } from "runtime:fs";
import { join } from "runtime:path";
import { args } from "runtime:process";

const option = (name) => Number(args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3));
const sections = option("sections");
const perSection = option("per-section");

async function htmlFiles(dir, out = []) {
  for (const entry of await readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDir) await htmlFiles(path, out);
    else if (entry.name === "index.html") out.push(path);
  }
  return out;
}

const docs = await htmlFiles("dist/docs");
const sizes = [];
for (const path of docs) sizes.push((await file(path).bytes()).byteLength);
sizes.sort((a, b) => a - b);
// A page in the middle section, halfway down its list.
const pad = (n, w) => String(n).padStart(w, "0");
const sample = await file(`dist/docs/section-${pad(Math.floor(sections / 2), 2)}/page-${pad(Math.floor(perSection / 2), 3)}/index.html`).text();
const gzip = (await new Response(new Blob([sample]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()).byteLength;
const payload = /<script type="application\/json" id="__afw_h">([\s\S]*?)<\/script>/.exec(sample)?.[1] ?? "";
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

console.log(`docs scale — ${docs.length} docs pages in ${sections} sections\n`);
console.log("| | |\n|---|---|");
console.log(`| median page | ${kb(sizes[Math.floor(sizes.length / 2)])} |`);
console.log(`| largest page | ${kb(sizes[sizes.length - 1])} |`);
console.log(`| sample page, gzip | ${kb(gzip)} |`);
console.log(`| sample page, sidebar links | ${(sample.match(/class="afwd-sidebar-link/g) ?? []).length} |`);
console.log(`| sample page, hydration payload | ${kb(payload.length)} |`);
console.log(`| all docs pages | ${mb(sizes.reduce((a, b) => a + b, 0))} |`);
