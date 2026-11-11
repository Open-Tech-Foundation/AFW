// `@opentf/afw-docs/vite` — the docs and blog generators for the Vite + Node workflow.
// Pair it with `@opentf/vite-plugin-afw`:
//
//   import afw from "@opentf/vite-plugin-afw";
//   import afwDocs from "@opentf/afw-docs/vite";
//   export default { plugins: [afw({ mode: "ssg" }), afwDocs()] };
//
// It reads the same afw.config as the esdev workflow and serves the same virtual
// modules: `@opentf/afw-docs/nav` (with a `docs` block), `/posts` (with `blog`) and
// `/updated` (with `lastUpdated`). After an SSG prerender it indexes search, writes the
// blog feeds and `llms.txt`.

import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { useHost } from "./host.js";
import { nodeHost } from "./hosts/node.js";
import { blogPostsModule } from "./blog-posts-plugin.js";
import { docsNavModule } from "./docs-nav-plugin.js";
import { blogDir, finishSite, wantsLastUpdated } from "./finish.js";
import { FENCE_SOURCE, highlightCodeFences } from "./highlight.js";
import { lastUpdatedModule, loadLastUpdated } from "./last-updated-plugin.js";

useHost(nodeHost);

export { finishSite } from "./finish.js";

const MODULES = ["nav", "posts", "updated"];
const VIRTUAL = (name) => `\0@opentf/afw-docs/${name}`;
// Files whose edits change the generated modules: pages (frontmatter) and `_meta.*`.
const SOURCE_FILE = /(?:^|\/)(?:page\.(?:mdx|md|[jt]sx)|_meta\.(?:js|mjs|json))$/;
const slash = (p) => p.replaceAll("\\", "/");

/** The project's afw.config (`.json`, `.js` or `.mjs`), or `{}`. */
export async function loadConfig(root) {
  for (const name of ["afw.config.json", "afw.config.js", "afw.config.mjs"]) {
    const file = path.join(root, name);
    let info;
    try {
      info = await stat(file);
    } catch {
      continue;
    }
    if (name.endsWith(".json")) return JSON.parse(await nodeHost.readText(file)) ?? {};
    const mod = await import(`${pathToFileURL(file).href}?t=${info.mtimeMs}`);
    return mod.default ?? {};
  }
  return {};
}

// `_meta.js` read fresh after an edit: Node caches modules by URL, so the URL carries
// the file's modification time.
async function importFresh(file) {
  const { mtimeMs } = await stat(file);
  return import(`${pathToFileURL(file).href}?t=${mtimeMs}`);
}

/**
 * @param {{ config?: object, appDir?: string, exclude?: string[] }} [options]
 *   `config` — the docs config (default: afw.config from the project root).
 *   `appDir` — the routes folder. `exclude` — folders under it that hold no pages.
 */
export default function afwDocs({ config: given, appDir: appDirOption = "app", exclude = [] } = {}) {
  let config = given ?? {};
  let root = slash(process.cwd());
  let appDir = "";
  let command = "serve";
  const excluded = new Set(exclude);

  const enabled = (name) =>
    name === "nav" ? Boolean(config.docs) : name === "posts" ? Boolean(config.blog) : wantsLastUpdated(config);

  async function generate(name) {
    const drafts = command === "serve";
    if (name === "nav") return docsNavModule({ appDir, exclude: excluded, importModule: importFresh, drafts });
    if (name === "posts") return blogPostsModule({ appDir, contentDir: blogDir(config), exclude: excluded, drafts });
    return lastUpdatedModule({ appDir, exclude: excluded, blogDir: blogDir(config) });
  }

  return {
    name: "afw-docs",
    enforce: "pre",

    async configResolved(resolved) {
      root = slash(resolved.root);
      command = resolved.command;
      appDir = slash(path.resolve(root, appDirOption));
      if (!given) config = await loadConfig(root);
    },

    configureServer(server) {
      // A page added, removed or renamed changes the navigation and post list.
      const refresh = (file) => {
        const p = slash(file);
        if (!p.startsWith(`${appDir}/`) || !SOURCE_FILE.test(p)) return;
        for (const env of Object.values(server.environments ?? { client: server })) {
          for (const name of MODULES) {
            const mod = env.moduleGraph?.getModuleById?.(VIRTUAL(name));
            if (mod) env.moduleGraph.invalidateModule(mod);
          }
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
    },

    resolveId(source) {
      const name = source.startsWith("@opentf/afw-docs/") ? source.slice("@opentf/afw-docs/".length) : null;
      return name && MODULES.includes(name) && enabled(name) ? VIRTUAL(name) : null;
    },

    async load(id) {
      const name = MODULES.find((n) => id === VIRTUAL(n));
      if (!name) return null;
      const { code, files } = await generate(name);
      for (const file of files) this.addWatchFile(file);
      return { code, map: null };
    },

    // Code-fence highlighting (highlight.js): `post`, so it runs on each `.md`/`.mdx`
    // page after @opentf/vite-plugin-afw has compiled it. The swap stays inside string
    // literals and adds no lines.
    transform: {
      order: "post",
      async handler(code, id) {
        if (!FENCE_SOURCE.test(id.split("?")[0])) return null;
        const out = await highlightCodeFences(code);
        return out === code ? null : { code: out, map: null };
      },
    },

    // Read by @opentf/vite-plugin-afw around its SSG prerender.
    api: {
      /** Data the prerender needs: the site URL and per-page last-updated times. */
      async afwPrerenderData() {
        const lastUpdated = wantsLastUpdated(config)
          ? await loadLastUpdated({ appDir, exclude: excluded, blogDir: blogDir(config) })
          : {};
        return { baseUrl: String(config?.site?.url ?? "").replace(/\/+$/, ""), lastUpdated };
      },
      /** Search index, feeds and llms.txt over the prerendered site. */
      async afwFinish({ outDir, siteDescription = "", baseUrl = "", afwc }) {
        if (!config.docs && !config.blog) return null;
        return finishSite({ root, appDir, config, siteDir: slash(outDir), baseUrl, exclude: excluded, siteDescription, afwc });
      },
    },
  };
}
