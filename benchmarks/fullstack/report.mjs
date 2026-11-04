// Turn a results file into the website's table data (website/app/fullstack-benchmark.json):
// one table per app size, rows = metrics, columns = tools, the lowest value marked best.
//
//   node benchmarks/fullstack/report.mjs [results/<date>.json]

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(HERE, "results", (await readdir(join(HERE, "results"))).filter((f) => f.endsWith(".json")).sort().at(-1));
const results = JSON.parse(await readFile(file, "utf8"));

const ENGINES = ["afw-esdev", "afw-vite", "next", "tanstack", "astro"];
const LABELS = { "afw-esdev": "AFW esdev", "afw-vite": "AFW Vite", next: "Next", tanstack: "TanStack", astro: "Astro" };
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
  measuredAt: results.measuredAt,
  runs: results.runs,
  engines: ENGINES,
  labels: LABELS,
  highlightEngines: ["afw-esdev", "afw-vite"],
  env: "Intel i7-8700K (12 threads), 16 GB RAM, Linux 6.12, Node 26.13, on a solid-state disk",
  tables,
};
const out = join(HERE, "..", "..", "website", "app", "fullstack-benchmark.json");
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`→ ${out}`);
