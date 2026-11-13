// What every toolchain does with an AFW source module: pick the compiler target for
// the build at hand, compile through `afwc`, and turn a failure into either a thrown
// diagnostic or a visible stub module.

/**
 * How an app renders overall, from its routes' policies: `client` when every page renders
 * in the browser, `static` when none renders per request but some are built, `server`
 * when any renders per request. It decides the browser build's compiler target.
 */
export const APP_RENDERS = new Set(["client", "static", "server"]);
/** Compiler backends: live DOM, HTML-string renderers, or the hydrating dual module. */
export const TARGETS = new Set(["csr", "ssg", "hydrate"]);

/** Source modules the compiler owns. */
export const SOURCE_FILTER = /\.(mdx|md|[jt]sx)$/;

/**
 * Throw on an unknown option, before any compiler starts. `mode` was removed: how pages
 * render is set per folder in `_config.js`.
 */
export function validateOptions({ mode, target } = {}) {
  if (mode !== undefined) {
    throw new Error('The AFW plugin\'s `mode` option was removed: set how pages render in app/_config.js, e.g. `export default defineRoute({ render: "server" })` (or "static", "client").');
  }
  if (target !== undefined && !TARGETS.has(target)) {
    throw new Error(`Unknown AFW compiler target: ${target} (expected csr, ssg, or hydrate)`);
  }
}

/**
 * The compiler target for one module. `app` is how the app renders overall (see
 * `APP_RENDERS`). `server` — the module is bundled for the server (string renderers).
 * `test` — a test run, which renders on the client. `dev` — a dev server's browser build:
 * the hydrating dual module when the dev server renders pages first, as production does
 * (`devRenders`, by default only for a `server` app); CSR otherwise. Otherwise a release
 * browser build: CSR for a client app, the hydrating dual module when pages render first.
 */
export function chooseTarget({ app = "client", target, server = false, dev = false, test = false, devRenders = app === "server" } = {}) {
  if (target) return target;
  if (server) return "ssg";
  if (test) return "csr";
  if (dev) return devRenders && app !== "client" ? "hydrate" : "csr";
  return app === "client" ? "csr" : "hydrate";
}

/** The compiler backend token for `target`, with `hot` selecting its refresh build. */
export function compilerTarget(target, hot = false) {
  if (!hot) return target;
  if (target === "csr") return "csr-hot";
  if (target === "hydrate") return "hydrate-hot";
  return target;
}

/** Whether framework imports in this build resolve to the DOM-free server entry. */
export function usesServerEntry({ target, server = false } = {}) {
  return (target ?? (server ? "ssg" : undefined)) === "ssg";
}

/** The framework specifiers that resolve to `@opentf/afw/server` in a server build. */
export const FRAMEWORK_IMPORT = /^@opentf\/afw(?:\/runtime)?$/;

/** Page, layout, 404, loading and error modules compile to route factories; the rest to components. */
export function isRouteModule(id) {
  const base = id.split(/[\\/]/).pop().replace(SOURCE_FILTER, "");
  return base === "page" || base === "layout" || base === "404" || base === "loading" || base === "error";
}

/** A module that shows the compile error in place of the page or component. */
export function errorStub(text) {
  return (
    `export default function () { const pre = document.createElement("pre");` +
    ` pre.style.cssText = "color:#f87171;padding:1rem;white-space:pre-wrap";` +
    ` pre.textContent = ${JSON.stringify(`Compile error\n\n${text}`)};` +
    ` return pre; }`
  );
}

/**
 * Compile one module. `server` is a compiler client (compiler-client.js). `hot`
 * requests the refresh-instrumented build of the target (CSR or hydrate). On failure, `failOnError` throws the
 * diagnostic (after `error(message)` when the toolchain reports through its own
 * channel); otherwise it logs and returns the stub, so one broken file does not
 * stop a dev server.
 *
 * @returns {Promise<{ code: string, map: object | null }>}
 */
export async function compileModule(server, code, id, {
  target, hot = false, failOnError = false, onResult, quiet = () => {}, error,
} = {}) {
  try {
    const out = await server.compile(id, code, !isRouteModule(id), compilerTarget(target, hot));
    onResult?.(id, null);
    return typeof out === "string" ? { code: out, map: null } : { code: out.code, map: out.map ?? null };
  } catch (e) {
    // `text` is the diagnostic as a terminal or overlay shows it — the position line
    // plus a code frame; `diag` is the same as fields, for the overlay.
    const text = e?.text ?? e?.message ?? String(e);
    const diag = e?.diag ?? { file: id, message: e?.message ?? String(e) };
    onResult?.(id, diag);
    // A build phase may be drawing on the terminal's last line; take it back first.
    quiet();
    if (failOnError) {
      error?.(`afwc failed:\n${text}`);
      throw e;
    }
    console.error(`✗ afwc failed:\n${text}`);
    return { code: errorStub(text), map: { version: 3, sources: [], names: [], mappings: "" } };
  }
}
