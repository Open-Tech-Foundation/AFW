// Prerender step for the afw-ui e2e app (`esdev build --config=esdev.ui-kit.json`).
// The starter's static-site step (create-afw), pointed at this fixture: renders every
// page under packages/afw-ui/e2e/app into the staged dist and stamps the hydrate
// sentinel, so the browser adopts the server HTML.
import { exit } from "runtime:process";
import { realPath } from "runtime:fs";
import { basename, dirname, fromFileURL, join } from "runtime:path";

const bundleDir = dirname(fromFileURL(import.meta.url).replace(/\\/g, "/"));
let stagingRoot = null;
for (let dir = bundleDir; ; ) {
  if (basename(dir).startsWith(".esdev-build-")) {
    stagingRoot = dir;
    break;
  }
  const up = dirname(dir);
  if (up === dir) break;
  dir = up;
}
if (!stagingRoot) {
  console.log("ssg: no staging area — prerender runs on a release `esdev build`, skipping.");
  exit(0);
}
const ssgModule = ["@opentf", "afw-cli", "ssg"].join("/");
const { closeCompilers, discoverPages, readText, resolveCompiler, resolveFrom, runPrerender, stampHydrateSentinel } =
  await import(ssgModule);

const root = dirname(stagingRoot);
const appDir = join(root, "packages/afw-ui/e2e/app");
const stagedOut = join(stagingRoot, "packages/afw-ui/e2e/dist");
const pages = await discoverPages(appDir, new Set());
const shellHtml = stampHydrateSentinel(await readText(join(stagedOut, "index.html")));
const afwEntry = await resolveFrom("@opentf/afw", root).then(realPath);
const { afwc } = await resolveCompiler();
const ssg = await runPrerender({ root, pages, afwEntry, afwc, shellHtml, outDir: stagedOut, baseUrl: "", docsPlugins: [], chunkManifest: null });
await closeCompilers();
if (!ssg.count || ssg.failed.length) throw new Error(`prerender failed: ${ssg.count} rendered, ${ssg.failed.length} failed`);
console.log(`ssg: prerendered ${ssg.count} page(s)`);
