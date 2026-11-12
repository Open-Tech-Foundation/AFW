// Server functions and the composed server for esdev builds (docs/SERVER_FUNCTIONS.md):
//
// - Browser builds load a `*.server.{js,ts}` module as fetch stubs; server builds keep
//   the real module (the `load` hook answers only when `ctx.platform` is "browser").
// - A server target imports the composed Fetch handler from the virtual `@afw/server`
//   (API routes, middleware, loader data and server functions), the module the Vite
//   plugin generates too:
//
//     import { createHandler } from "@afw/server";
//     export default { fetch: createHandler({ fallback: serveStatic }) };
//
// - With `pages` (`mode: "ssr"`), it also registers every page and exports
//   `createPageRenderer({ shell })`, a `renderPage` step for per-request rendering.

import {
  SERVER_ID, SERVER_MODULE_FILE, resolveAppRoot, serverExports, serverFunctionStub, serverModule,
} from "@opentf/afw-build";

import { fromFileURL } from "runtime:path";

import { esdevHost } from "./host.js";

// The generated module imports the document renderer; an app does not depend on
// @opentf/afw-build itself, so it resolves from this package.
const DOCUMENT_ID = "@opentf/afw-build/document";
const HERE = fromFileURL(import.meta.url);

const SERVER_VIRTUAL = /^@afw\/server:/;

/** Whether `load` should answer `id` (the virtual server module, or a `.server` module). */
export const SERVER_LOAD_FILTER = /^@afw\/server:|\.server\.(?:[cm]?js|[cm]?ts)$/;

/** Specifiers the `resolve` hook answers. */
export const SERVER_RESOLVE_IDS = [SERVER_ID, DOCUMENT_ID];

/**
 * `resolve` / `load` handlers. `getCompiler()` returns the running `afwc serve`
 * client, shared with the JSX transform.
 */
export function createAfwServer({ appDir = "app", exclude = [], getCompiler, pages = false }) {
  const listExports = async (file) => serverExports(await getCompiler(), file, await esdevHost.readText(file));
  return {
    async resolve(source, importer, ctx) {
      // skipSelf: this hook answers the same specifier, so it must not see the call.
      if (source === DOCUMENT_ID) return ctx.resolve(source, HERE, { skipSelf: true });
      if (source !== SERVER_ID) return null;
      return { id: `${SERVER_ID}:${await resolveAppRoot(esdevHost, appDir, importer)}`, virtual: true };
    },
    async load(id, ctx) {
      if (SERVER_VIRTUAL.test(id)) {
        const root = id.slice(SERVER_ID.length + 1);
        // Drafts and scheduled pages render in the dev loop only. Pages are rendered with
        // the hydration marker there too: the dev browser build is the hydrate target with
        // component refresh, so it adopts the server DOM as production does.
        const dev = ctx?.command === "start";
        const { code, files } = await serverModule(esdevHost, root, { exclude, listExports, pages, drafts: dev });
        return { code, type: "js", dependsOn: files };
      }
      if (!SERVER_MODULE_FILE.test(id) || ctx?.platform !== "browser") return null;
      const root = await resolveAppRoot(esdevHost, appDir, id);
      if (!id.startsWith(`${root}/`)) throw new Error(`${id}: server modules must be inside the app directory (${root})`);
      return { code: serverFunctionStub(root, id, await listExports(id)), type: "js" };
    },
  };
}
