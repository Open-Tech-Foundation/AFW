// `afwDocsPlugin` — the whole docs toolchain for esdev as one `esdev.json` entry:
//
//   { "module": "@opentf/afw-docs/build", "export": "afwDocsPlugin", "options": { "appDir": "app" } }
//
// It reads the project's afw.config and returns the plugins the config asks for — the
// same set `afwDocs()` serves on Vite:
// - `docs` → the sidebar navigation (`@opentf/afw-docs/nav`);
// - `blog` → the post list (`@opentf/afw-docs/posts`);
// - `lastUpdated` (docs or blog) → the per-page dates (`@opentf/afw-docs/updated`);
// - always → code-fence highlighting of compiled `.md`/`.mdx` pages.
// esdev (0.27+) takes a list from one entry, in the entry's place in `plugins`.
// Toolchain-neutral apart from the host it reads files through.

import { exists, join, readText, toFileUrl, cwd } from "./host.js";
import { blogPostsPlugin } from "./blog-posts-plugin.js";
import { codeHighlightPlugin } from "./code-highlight-plugin.js";
import { docsNavPlugin } from "./docs-nav-plugin.js";
import { blogDir, wantsLastUpdated } from "./finish.js";
import { lastUpdatedPlugin } from "./last-updated-plugin.js";

/** The project's afw.config (`.json`, `.js` or `.mjs`) in `root`, or `{}`. */
export async function loadDocsConfig(root) {
  const json = join(root, "afw.config.json");
  if (await exists(json)) return JSON.parse(await readText(json)) ?? {};
  for (const name of ["afw.config.js", "afw.config.mjs"]) {
    const file = join(root, name);
    if (await exists(file)) return (await import(toFileUrl(file))).default ?? {};
  }
  return {};
}

/**
 * esdev plugin factory: every docs build plugin the project's config enables.
 *
 * @param {{ appDir?: string, exclude?: string[], root?: string, config?: object }} [options]
 *   `appDir` — the routes folder (default `"app"`, resolved from where esdev runs).
 *   `exclude` — folders under it that hold no pages. `root` — where afw.config lives
 *   (default: where esdev runs). `config` — use this config instead of reading one.
 * @returns {Promise<object[]>} The plugins, in order.
 */
export async function afwDocsPlugin({ appDir = "app", exclude = [], root, config } = {}) {
  const docsConfig = config ?? (await loadDocsConfig(root ?? cwd()));
  const excluded = new Set(exclude);
  const blog = blogDir(docsConfig);
  return [
    docsConfig.docs && docsNavPlugin({ appDir, exclude: excluded }),
    blog && blogPostsPlugin({ appDir, contentDir: blog, exclude: excluded }),
    wantsLastUpdated(docsConfig) && lastUpdatedPlugin({ appDir, exclude: excluded, blogDir: blog }),
    codeHighlightPlugin(),
  ].filter(Boolean);
}
