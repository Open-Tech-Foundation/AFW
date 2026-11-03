import type { Plugin } from "vite";

export interface AfwPluginOptions {
  /** How pages render in release builds. Default `"spa"`. */
  mode?: "spa" | "ssg" | "ssr";
  /** The routes folder. A bare name is found beside the importing entry. Default `"app"`. */
  appDir?: string;
  /** Folders under `appDir` that hold no routes. */
  exclude?: string[];
  /** `false` drops the `@afw/routes` module. Default `true`. */
  routes?: boolean;
  /** Build `dist/server`: `"auto"` (default) when the app has API routes, middleware or loaders. */
  server?: boolean | "auto";
  /** Force one compiler backend (tests, custom builds). */
  target?: "csr" | "ssg" | "hydrate";
  /** Locale prefixes for server routes and rendered pages. */
  i18n?: { locales: string[]; defaultLocale?: string } | null;
  /** The site's absolute URL, for canonical links and `sitemap.xml`. */
  baseUrl?: string;
}

/** AFW for Vite: compiles components, serves `@afw/routes`, runs server routes on Node. */
export default function afw(options?: AfwPluginOptions): Plugin;
