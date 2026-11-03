import type { Plugin } from "vite";

export interface AfwDocsViteOptions {
  /** The docs config. Default: afw.config.{json,js,mjs} from the project root. */
  config?: Record<string, unknown>;
  /** The routes folder. Default `"app"`. */
  appDir?: string;
  /** Folders under `appDir` that hold no pages. */
  exclude?: string[];
}

/** The docs and blog generators for Vite: navigation, posts, last-updated, search, feeds, llms.txt. */
export default function afwDocs(options?: AfwDocsViteOptions): Plugin;

/** Run the post-prerender steps (search index, feeds, llms.txt) yourself. */
export function finishSite(options: Record<string, unknown>): Promise<unknown>;

/** The project's afw.config, or `{}`. */
export function loadConfig(root: string): Promise<Record<string, unknown>>;
