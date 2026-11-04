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

import { CONTENT_TYPE, decode, encode } from "../core/fn-codec.js";
import { isNotFound } from "./loader.js";

const MARK = Symbol.for("afw.serverFunction");

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
  const fn = async (input, context = {}) => handler(await validate(schema, input), context);
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
 * @param {{ maxBodyBytes?: number }} [options]
 * @returns {{ size: number, handle: (request: Request, context?: object) => Promise<Response | null> }}
 *   `handle` answers a request for one of the endpoints, or returns null. `context` is
 *   what middleware built (`locals`, `env`, `ctx`).
 */
export function createServerFunctions(endpoints = {}, { maxBodyBytes = 1024 * 1024 } = {}) {
  const table = new Map();
  for (const [path, fn] of Object.entries(endpoints)) {
    const kind = serverFunctionKind(fn);
    if (!kind) throw new TypeError(`${path}: not a query() or action()`);
    table.set(path, { kind, fn });
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
    try {
      if (method === "GET") {
        input = decode(url.searchParams.get("a") ?? "");
      } else {
        const type = request.headers.get("content-type") ?? "";
        // Forms and plain-text posts can be sent cross-site without a preflight; JSON cannot.
        if (!type.startsWith(CONTENT_TYPE)) return json(415, { error: { message: `Expected ${CONTENT_TYPE}` } });
        const body = await request.text();
        if (body.length > maxBodyBytes) return json(413, { error: { message: "Request body too large" } });
        input = decode(body);
      }
    } catch {
      return json(400, { error: { message: "Malformed request body" } });
    }

    const ctx = { request, url, locals: context.locals ?? {}, env: context.env, ctx: context.ctx };
    try {
      const result = await entry.fn(input, ctx);
      return new Response(encode(result), { status: 200, headers: { "content-type": CONTENT_TYPE, "cache-control": "no-store" } });
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
