// Server functions (docs/SERVER_FUNCTIONS.md): `query()` and `action()` exports of
// `*.server.{js,ts}` modules, callable from the browser through a generated stub and
// directly from other server code.
//
//   export const listTodos = query(async (args, { locals }) => db.list(locals.user));
//   export const addTodo = action(schema, async (input, context) => db.insert(input));
//
// The build gives each function an endpoint under its folder (`/todos/__fn/<id>`), so
// that folder's `_middleware` guards it like a page. `createServerFunctions` turns the
// build's `{ endpoint: fn }` map into a handler for those requests.
//
// Single-flight updates: an action names the queries it changed with `refresh()` from
// its context, and their fresh results go back with its own response:
//
//   export const addTodo = action(schema, async (input, { refresh }) => {
//     await db.insert(input);
//     refresh(listTodos);            // every input of listTodos the page shows
//     refresh(getTodo, { id: 1 });   // or one input
//   });
//
// The browser sends the inputs of the queries it shows (`x-afw-live`, at most
// MAX_REFRESH); the server re-runs the named ones after the action and returns them.
// Only queries in the action's folder or a parent folder run there, since their
// middleware already ran for this request; others go back as stale and the browser
// refetches them through their own middleware.

import { CONTENT_TYPE, LIVE_HEADER, MAX_DEPTH, MAX_REFRESH, REFRESH_HEADER, SerializeError, decode, encode } from "../core/fn-codec.js";
import { isNotFound } from "./loader.js";

const MARK = Symbol.for("afw.serverFunction");

const noRefresh = () => {};

/** Thrown to the caller when the input does not match the function's schema. */
export class ValidationError extends Error {
  constructor(issues) {
    super("Invalid input");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

const isSchema = (value) => typeof value?.["~standard"]?.validate === "function";

/** Validate `input` with a Standard Schema (https://standardschema.dev) schema. */
async function validate(schema, input) {
  if (!schema) return input;
  const result = await schema["~standard"].validate(input);
  if (result.issues) throw new ValidationError(result.issues.map((i) => ({ message: i.message, path: i.path?.map((p) => (typeof p === "object" ? p.key : p)) })));
  return result.value;
}

function define(kind, args) {
  const [schema, handler] = args.length >= 2 ? args : [undefined, args[0]];
  if (schema !== undefined && !isSchema(schema)) {
    throw new TypeError(`${kind}(schema, fn): the schema must implement Standard Schema (zod, valibot, arktype…)`);
  }
  if (typeof handler !== "function") throw new TypeError(`${kind}(): the last argument must be a function`);
  // Called directly from server code (a loader, an API route, another function): run it
  // with the given context, input validated the same way as over HTTP.
  // `refresh` is a no-op outside an HTTP action call, so a handler can always call it.
  const fn = async (input, context = {}) =>
    handler(await validate(schema, input), typeof context.refresh === "function" ? context : { ...context, refresh: noRefresh });
  Object.defineProperty(fn, MARK, { value: { kind, schema, handler } });
  return fn;
}

/** A read: idempotent, callable with GET or POST. `query(fn)` or `query(schema, fn)`. */
export function query(...args) {
  return define("query", args);
}

/** A write: POST only. `action(fn)` or `action(schema, fn)`. */
export function action(...args) {
  return define("action", args);
}

/** The kind of a server function export (`"query"` | `"action"`), or null. */
export function serverFunctionKind(value) {
  return (typeof value === "function" && value[MARK]?.kind) || null;
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

// A cross-site request carrying the user's cookies must not reach an endpoint. Browsers
// send `Origin` on POST and `Sec-Fetch-Site` on every request; a client that sends
// neither is not a browser, so it cannot be forging a user's request.
function crossSite(request, url) {
  const origin = request.headers.get("origin");
  if (origin) return origin !== url.origin;
  const site = request.headers.get("sec-fetch-site");
  return site != null && site !== "same-origin" && site !== "none";
}

/**
 * The handler for server function requests.
 *
 * @param {Record<string, Function>} endpoints  `{ "/todos/__fn/<id>": listTodos }`, built
 *        by the toolchain from the app's `*.server` modules.
 * @param {{ maxBodyBytes?: number, maxDepth?: number }} [options]  limits on the decoded
 *        input: body size (default 1 MiB) and nesting depth (default 64)
 * @returns {{ size: number, handle: (request: Request, context?: object) => Promise<Response | null> }}
 *   `handle` answers a request for one of the endpoints, or returns null. `context` is
 *   what middleware built (`locals`, `env`, `ctx`).
 */
export function createServerFunctions(endpoints = {}, { maxBodyBytes = 1024 * 1024, maxDepth = MAX_DEPTH } = {}) {
  const limits = { maxLength: maxBodyBytes, maxDepth };
  const table = new Map();
  const paths = new Map(); // fn → endpoint, for `refresh(listTodos)`
  for (const [path, fn] of Object.entries(endpoints)) {
    const kind = serverFunctionKind(fn);
    if (!kind) throw new TypeError(`${path}: not a query() or action()`);
    table.set(path, { kind, fn });
    paths.set(fn, path);
  }

  /** `refresh()`'s arguments as targets: a query, optionally followed by one input. */
  function targetsOf(args, into) {
    for (let i = 0; i < args.length; i++) {
      const path = paths.get(args[i]);
      if (!path || table.get(path).kind !== "query") {
        throw new TypeError("refresh() takes queries exported from a .server module, each optionally followed by its input");
      }
      if (i + 1 < args.length && typeof args[i + 1] !== "function") into.push({ path, inputs: [args[++i]] });
      else into.push({ path, inputs: null });
    }
  }

  /**
   * Re-run the queries an action refreshed: `{ fresh: [[endpoint, input, data]],
   * stale: [[endpoint, input?]], endpoints }`. `live` holds the inputs the page shows;
   * `endpoints` are the queries refreshed without an input (all their calls changed).
   */
  async function runRefresh(action, targets, live, ctx) {
    const folder = folderOf(action);
    const fresh = [];
    const stale = [];
    const endpoints = new Set();
    const runs = [];
    for (const { path, inputs } of targets) {
      // A query refreshed without an input covers all of its calls; with one, only that.
      if (!inputs) endpoints.add(path);
      if (!inScope(folder, folderOf(path))) {
        // Its own middleware must run: the browser refetches it.
        if (inputs) for (const input of inputs) stale.push([path, input]);
        else stale.push([path]);
        continue;
      }
      for (const input of inputs ?? live.filter(([p]) => p === path).map(([, i]) => i)) {
        if (runs.length >= MAX_REFRESH) stale.push([path, input]);
        else runs.push({ path, input });
      }
    }
    const settled = await Promise.allSettled(runs.map(({ path, input }) => table.get(path).fn(input, { ...ctx, refresh: noRefresh })));
    settled.forEach((outcome, i) => {
      const { path, input } = runs[i];
      if (outcome.status === "fulfilled") fresh.push([path, input, outcome.value]);
      else stale.push([path, input]); // the browser's own call reports the error
    });
    return { fresh, stale, endpoints: [...endpoints] };
  }

  async function handle(request, context = {}) {
    const url = new URL(request.url);
    const entry = table.get(url.pathname);
    if (!entry) return null;
    const method = request.method.toUpperCase();
    const allowed = entry.kind === "query" ? "GET, POST" : "POST";
    if (!allowed.split(", ").includes(method)) return json(405, { error: { message: "Method not allowed" } }, { allow: allowed });
    if (crossSite(request, url)) return json(403, { error: { message: "Cross-site request refused" } });

    let input;
    let live = [];
    try {
      if (method === "GET") {
        input = decode(url.searchParams.get("a") ?? "", limits);
      } else {
        const type = request.headers.get("content-type") ?? "";
        // Forms and plain-text posts can be sent cross-site without a preflight; JSON cannot.
        if (!type.startsWith(CONTENT_TYPE)) return json(415, { error: { message: `Expected ${CONTENT_TYPE}` } });
        input = decode(await request.text(), limits);
        if (entry.kind === "action" && request.headers.get(LIVE_HEADER) === "1") {
          if (!isEnvelope(input)) return json(400, { error: { message: "Malformed request body" } });
          ({ input, live } = input);
        }
      }
    } catch (error) {
      if (error instanceof SerializeError && error.code === "INPUT_TOO_LARGE") {
        return json(413, { error: { message: "Request body too large" } });
      }
      return json(400, { error: { message: "Malformed request body" } });
    }

    const ctx = { request, url, locals: context.locals ?? {}, env: context.env, ctx: context.ctx };
    const targets = [];
    if (entry.kind === "action") ctx.refresh = (...args) => targetsOf(args, targets);
    try {
      const result = await entry.fn(input, ctx);
      const headers = { "content-type": CONTENT_TYPE, "cache-control": "no-store" };
      if (targets.length === 0) {
        // A result the codec refuses (a class instance, a function) is a server bug: 500.
        return new Response(encode(result), { status: 200, headers });
      }
      const refresh = await runRefresh(url.pathname, targets, live, ctx);
      return new Response(encode({ result, refresh }), { status: 200, headers: { ...headers, [REFRESH_HEADER]: "1" } });
    } catch (error) {
      if (error instanceof Response) return error; // a redirect or custom status from the function
      if (error instanceof ValidationError) return json(400, { error: { message: error.message, issues: error.issues } });
      if (isNotFound(error)) return json(404, { error: { message: "Not found" } });
      console.error(`✗ server function ${url.pathname}:`, error?.stack ?? error);
      return json(500, { error: { message: "Internal Server Error" } });
    }
  }

  return { size: table.size, handle };
}

/** The folder of an endpoint: `/todos/__fn/x` → `/todos`, `/__fn/x` → `""`. */
function folderOf(endpoint) {
  const i = endpoint.lastIndexOf("/__fn/");
  return i <= 0 ? "" : endpoint.slice(0, i);
}

/** Is `query` in `action`'s folder or above it (so its middleware ran for the action)? */
function inScope(action, query) {
  return query === "" || action === query || action.startsWith(`${query}/`);
}

/** An action body with the page's shown queries: `{ input, live: [[endpoint, input]] }`. */
function isEnvelope(body) {
  if (!body || typeof body !== "object" || !("input" in body) || !Array.isArray(body.live)) return false;
  if (body.live.length > MAX_REFRESH) return false;
  return body.live.every((call) => Array.isArray(call) && call.length === 2 && typeof call[0] === "string");
}
