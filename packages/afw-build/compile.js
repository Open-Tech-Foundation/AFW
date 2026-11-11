// What every toolchain does with an AFW source module: pick the compiler target for
// the build at hand, compile through `afwc`, and turn a failure into either a thrown
// diagnostic or a visible stub module.

/** Rendering modes a project chooses from. */
export const MODES = new Set(["spa", "ssg", "ssr"]);
/** Compiler backends: live DOM, HTML-string renderers, or the hydrating dual module. */
export const TARGETS = new Set(["csr", "ssg", "hydrate"]);

/** Source modules the compiler owns. */
export const SOURCE_FILTER = /\.(mdx|md|[jt]sx)$/;

/** Throw on an unknown mode or target, before any compiler starts. */
export function validateOptions({ mode = "spa", target } = {}) {
  if (!MODES.has(mode)) throw new Error(`Unknown AFW rendering mode: ${mode} (expected spa, ssg, or ssr)`);
  if (target !== undefined && !TARGETS.has(target)) {
    throw new Error(`Unknown AFW compiler target: ${target} (expected csr, ssg, or hydrate)`);
  }
}

/**
 * The compiler target for one module. `server` — the module is bundled for the
 * server (string renderers). `dev` — a dev server or test run, which always renders
 * on the client. Otherwise a release browser build: CSR for an SPA, the hydrating
 * dual module when the server renders first.
 */
export function chooseTarget({ mode = "spa", target, server = false, dev = false } = {}) {
  if (target) return target;
  if (server) return "ssg";
  if (dev) return "csr";
  return mode === "spa" ? "csr" : "hydrate";
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
 * requests the refresh-instrumented CSR build. On failure, `failOnError` throws the
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
    const out = await server.compile(id, code, !isRouteModule(id), hot && target === "csr" ? "csr-hot" : target);
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
