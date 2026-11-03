// SSG pre-render (ARCHITECTURE.md §6): build a *server* bundle of the app with the
// compiler's SSG backend (HTML-string renderers), then run it in-process to
// render each route to a static HTML file. No DOM — the SSG output is pure string
// concatenation, so no effects/lifecycle run.

import { join } from "runtime:path";

import { prerender } from "@opentf/afw-build";
import { esdevHost } from "@opentf/esdev-plugin-afw";

import { buildServerBundle } from "./shared.js";

/**
 * Pre-render the app to static HTML files under `outDir`. Returns
 * `{ count, skipped, failed, siteDescription }` — `siteDescription` is the site's own
 * `<meta name="description">` text (home route, falling back to the root layout's
 * route-independent metadata), which `llms.txt` uses for its summary line.
 *
 * The rendering itself is `prerender` from `@opentf/afw-build`, shared with the Vite
 * workflow; this builds the esdev server bundle it renders from.
 */
export async function runPrerender({ root, pages, afwEntry, afwc, shellHtml, outDir, baseUrl = "", docsPlugins = [], lastUpdated = {}, i18n = null, loaders = null, chunkManifest = null, onCompile, onRender }) {
  const { mod, cleanup } = await buildServerBundle({ root, pages, afwEntry, afwc, docsPlugins, i18n, onCompile });
  try {
    const { count, skipped, failed, siteDescription } = await prerender(esdevHost, {
      render: mod, shellHtml, outDir, publicDir: join(root, "public"), baseUrl, lastUpdated, i18n, loaders,
      chunkManifest, onRender,
    });
    return { count, skipped, failed, siteDescription };
  } finally {
    await cleanup();
  }
}
