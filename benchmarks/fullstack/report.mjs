// Turn the results files into the website's table data (website/app/fullstack-benchmark.json):
// one table per app size, rows = metrics, columns = tools, the lowest value marked best.
// Each tool's numbers come from the newest file that measured it, so a rerun of some
// tools (--only) on a later day adds to the earlier results.
//
//   node benchmarks/fullstack/report.mjs [results/<date>.json ...] [--out=<file>]

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="))?.slice(6);
const given = args.filter((a) => !a.startsWith("--out="));
const files = given.length
  ? given
  : (await readdir(join(HERE, "results"))).filter((f) => f.endsWith(".json")).sort().map((f) => join(HERE, "results", f));
// Oldest first, so a newer file's tools replace an older file's.
const runs = (await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, "utf8"))))).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
const results = { sizes: runs.at(-1).sizes, runs: runs.at(-1).runs, tools: {}, dates: new Set() };
for (const run of runs) {
  for (const [tool, sizes] of Object.entries(run.tools)) results.tools[tool] = { ...sizes, measuredAt: run.measuredAt };
}
for (const tool of Object.values(results.tools)) results.dates.add(tool.measuredAt);
const dates = [...results.dates].sort();

const ENGINES = ["afw-esdev", "afw-vite", "next", "tanstack", "solidstart", "sveltekit", "nuxt", "astro"];
const LABELS = { "afw-esdev": "AFW esdev", "afw-vite": "AFW Vite", next: "Next", tanstack: "TanStack", solidstart: "SolidStart", sveltekit: "SvelteKit", nuxt: "Nuxt", astro: "Astro" };
const METRICS = [
  ["Build memory (MB)", "buildMemoryMb", 0],
  ["Build time (s)", "buildSeconds", 2],
  ["Dev start (s)", "devStartSeconds", 2],
  ["Edit to browser (s)", "editToBrowserSeconds", 3],
];

const tables = results.sizes.map((k) => ({
  k,
  rows: METRICS.map(([label, key, digits]) => {
    const round = (v) => Number(v.toFixed(digits));
    const values = {};
    for (const engine of ENGINES) {
      const cell = results.tools[engine]?.[k];
      if (cell && cell.parity === true && typeof cell[key] === "number") values[engine] = round(cell[key]);
    }
    const best = Object.entries(values).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
    return { label, digits, values, best };
  }),
}));

const report = {
  measuredAt: dates.length > 1 ? `${dates[0]} to ${dates.at(-1)}` : dates[0],
  runs: results.runs,
  engines: ENGINES,
  labels: LABELS,
  highlightEngines: ["afw-esdev", "afw-vite"],
  env: "Intel i7-8700K (12 threads), 16 GB RAM, Linux 6.12, Node 26.13, on a solid-state disk",
  tables,
};
const out = outArg ?? join(HERE, "..", "..", "website", "app", "fullstack-benchmark.json");
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`→ ${out}`);
