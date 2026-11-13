// File-convention routing for pure-esdev apps: a virtual `@afw/routes`
// module built by crawling `app/` — the same map the file discovery would
// hand `mountApp`, without a CLI in the loop:
//
//   // entry.js — the whole app shell, Vite-style:
//   import { mountApp } from "@opentf/afw";
//   import { guard, pages, loaderRoutes } from "@afw/routes";
//
//   mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
//
// ```json
// { "plugins": [{ "module": "@opentf/esdev-plugin-afw",
//                 "export": "createAfwRoutes",
//                 "options": { "appDir": "app" } }] }
// ```
//
// `appDir` is a leaf resolved against the importing entry's site root (see
// `createAfwRoutes`), so every app in a multi-app repo shares the one value.
//
// Route keys keep their `/app/...` shape because the runtime's `routeFromPath`
// anchors on it; layouts compose by path (`layout.jsx` wraps its directory).
// Page / layout / 404 modules compile through the `afw` transform plugin —
// list both. The `resolve` + `load` hooks run during builds and for unbundled
// tests/scripts too. Tests that hand-write their map can
// omit this plugin from their config.

import {
  ROUTES_ID,
  isUnpublishedPage as isUnpublishedWith,
  resolveAppRoot,
  routesModule,
} from "@opentf/afw-build";

import { esdevHost } from "./host.js";

/**
 * Whether a Markdown page is unpublished: frontmatter `draft: true`, or a `date` later
 * than now (scheduled). Production builds leave such pages out of the route table, so
 * their text never reaches a bundle; the dev server (`esdev start`) keeps them.
 */
export function isUnpublishedPage(path, now = Date.now()) {
  return isUnpublishedWith(esdevHost, path, now);
}

export function createAfwRoutes({ appDir = "app", exclude = [], shapeOf = null } = {}) {
  return {
    name: "afw-routes",
    // The importer is only visible to `resolve` (as a positional), never to
    // `load` — so `resolve` answers a per-site virtual id (`@afw/routes:<appRoot>`)
    // and `load` parses its site back out. Stateless across concurrent builds.
    resolve: {
      filter: { id: ROUTES_ID },
      async handler(source, importer) {
        const appRoot = await resolveAppRoot(esdevHost, appDir, importer);
        return { id: `${ROUTES_ID}:${appRoot}`, virtual: true };
      },
    },
    load: {
      filter: { id: /^@afw\/routes:/ },
      async handler(id, ctx) {
        const root = id.slice(ROUTES_ID.length + 1);
        // Drafts and scheduled pages are routes in the dev server only.
        // Route policies (`_config.js`) mark the entries that render in the browser.
        const shape = shapeOf ? await shapeOf(root, ctx) : null;
        const { code, files } = await routesModule(esdevHost, root, {
          exclude, drafts: ctx?.command === "start", clientFiles: shape?.clientFiles,
        });
        // The discovered files, so an edit rebuilds the map. (Directories are
        // not listed: `dependsOn` names files the graph cannot discover.)
        return { code, type: "js", dependsOn: [...files, ...(shape?.configFiles ?? [])] };
      },
    },
  };
}
