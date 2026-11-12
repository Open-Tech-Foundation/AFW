// Types for the `@opentf/afw/server` entry. The API-routes surface is fully typed
// (./api); the SSG string-builders and render helpers — authored in JS and mostly
// consumed by generated entry code — are declared with permissive signatures.

export * from "./api.js";
export * from "./cookies.js";
export * from "../core/signals.js";
export * from "../core/reactive.js";
export * from "../core/errors.js";
export * from "../core/route.js";
export * from "../core/context.js";
export * from "../runtime/lifecycle.js";
export { resource } from "../runtime/resource.js";
export { invalidate } from "../runtime/invalidate.js";
export { copyText, copyWithFeedback } from "../runtime/clipboard.js";

/** DOM-free built-in renderers used by the server compiler. */
export interface ServerComponent {
  (props: Record<string, unknown>, children?: string): string;
  tag: string;
  hostClass?: string;
  hostAttrs?: (props: Record<string, unknown>) => string;
}
export const Link: ServerComponent;
export const ContextProvider: ServerComponent;
export const Portal: ServerComponent;
export const ErrorBoundary: ServerComponent;
export const Pending: ServerComponent;
/** Compiler-emitted: a lazy component's loader with its placeholder tag (renders the empty placeholder on the server). */
export function lazyComponent<L extends () => Promise<unknown>>(loader: L, tag: string): L & { readonly tag: string };
export const RawHtml: ServerComponent;
export const CodeFence: ServerComponent;
export function shouldInterceptNav(): boolean;

/** Register eager namespaces or lazy module loaders, keyed by app file path. */
export function registerRoutes(modules: Record<string, unknown>): void;
/** Request-scoped route values during SSR. */
export const router: {
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  /** One string per name; a repeated name keeps its last value. Use
   *  `searchParams.getAll(name)` for every value. */
  readonly query: Record<string, string>;
  readonly params: RouteParams;
  readonly locale: string | null;
  readonly data: unknown;
  /** The current page's headings (MDX `export const toc`), or `[]`. */
  readonly toc: { depth: number; id: string; text: string }[];
};
export function matchRoute(pathname: string): { entry: unknown; params: RouteParams; route: string } | null;
export function configureI18n(config: { locales: string[]; defaultLocale?: string } | null): void;
export function i18nLocales(): { locales: string[]; defaultLocale: string } | null;
export function resolveLocale(pathname: string): { locale: string | null; path: string };
export function localizePath(pathname: string, locale?: string | null): string;
/** Set the current request's locale during server rendering. */
export function setLocale(locale: string | null): void;
/** Publish a page module's `toc` export as `router.toc`. */
export function setRouteToc(pageModule: { toc?: unknown } | null | undefined): void;
/** Set the current request's route state directly. */
export function setRouteState(state?: {
  pathname?: string;
  search?: string;
  params?: RouteParams;
  locale?: string | null;
  data?: unknown;
}): void;
/** No-op on the server: there is no mounted app to navigate. */
export function navigate(path: string, replace?: boolean): Promise<void>;
/** No-op on the server. */
export function prefetch(path: string): void;
/** Always `false` during server rendering. */
export function isHydrating(): boolean;
export { emit } from "../runtime/events.js";

// ── Render / route API (render.js) ─────────────────────────────────────────────
export interface RenderResult {
  html: string;
  metadata: Record<string, unknown>;
  hydration: unknown;
  status?: number;
}
export function renderRoute(
  pathname: string,
  params?: Record<string, unknown> | null,
  search?: string,
  options?: { data?: unknown },
): Promise<RenderResult | null>;
export function renderToString(pathname: string, search?: string): Promise<string>;
/** Register `_config.js` `paths` functions by route pattern (used by the generated server module). */
export function registerStaticPaths(map: Record<string, () => unknown>): void;
export function collectRoutePaths(): Promise<{
  paths: Array<{ path: string; params: Record<string, unknown>; route: string }>;
  skipped: string[];
}>;

// ── <head> / metadata (head.js) ─────────────────────────────────────────────────
export function resolveMetadata(args?: {
  route?: string;
  entry?: unknown;
  layouts?: unknown[];
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
export function renderHead(meta?: Record<string, unknown>, opts?: { path?: string; baseUrl?: string; managed?: boolean }): string;
export function localeAlternateLinks(
  routePath: string,
  cfg?: { locales?: string[]; defaultLocale?: string },
  localize?: (path: string, locale: string) => string,
): Array<Record<string, string>>;

// ── Route loaders (loader.js) ───────────────────────────────────────────────────
import type { RouteParams } from "./api.js";

/** The context a route loader receives (docs/DATA.md). `request` is the live
 *  Request under serve/dev and undefined at SSG prerender; `locals` is reserved. */
export interface LoaderContext {
  params: RouteParams;
  /** One string per name; a repeated name keeps its last value. For every value, read
   *  `new URL(request.url).searchParams.getAll(name)` (request servers only). */
  query: Record<string, string>;
  request?: Request;
  locale: string | null;
  locals: Record<string, unknown>;
}

/** A route loader — the default (or named `loader`) export of a `loader.{js,ts}`
 *  file. Returns the page's JSON-serializable data. */
export type Loader = (context: LoaderContext) => unknown | Promise<unknown>;

export interface LoaderMatch {
  route: string;
  params: RouteParams;
  locale: string | null;
}

export interface LoaderRegistry {
  routes: string[];
  match(pathname: string): LoaderMatch | null;
  load(m: LoaderMatch, ctx?: { request?: Request; query?: Record<string, string> }): Promise<unknown>;
  loadSerialized(
    m: LoaderMatch,
    ctx?: { request?: Request; query?: Record<string, string> },
  ): Promise<{ data: unknown; json: string }>;
  handle(request: Request): Promise<Response | null>;
}

export function createLoaderRegistry(
  loaderModules?: Record<string, { default?: Loader; loader?: Loader }>,
  /** `pageRoutes`: every page route, so a page beneath a `layout.loader.*` matches without a loader of its own. */
  options?: { appDir?: string; i18n?: { locales?: string[]; defaultLocale?: string }; pageRoutes?: string[] },
): LoaderRegistry;
/** The route a `loader.*` (its page) or `layout.loader.*` (its layout's folder) belongs to. */
export function loaderRouteFromPath(filePath: string, appDir?: string): string;
/** Is this a `layout.loader.{js,ts}` file? */
export function isLayoutLoaderFile(filePath: string): boolean;
/** Does the layout at `folder` wrap the page at `route`? */
export function layoutWraps(folder: string, route: string): boolean;
/** Page routes with loader data: their own `loader.*`, or beneath a `layout.loader.*`. */
export function loaderPageRoutes(routes: { pages?: string[]; pageLoaders?: string[]; layoutLoaders?: string[] }): string[];
/** Throw "this page does not exist" from inside a loader (404 semantics). */
export function notFound(message?: string): never;
export function isNotFound(e: unknown): boolean;
export function serializeRouteData(value: unknown): string;

// ── SSG string-builder helpers (ssg-runtime.js) ─────────────────────────────────
export function defineSSG(tag: string, render: (...args: any[]) => string): void;
export function beginHydrationCollect(): void;
export function endHydrationCollect(): unknown;
export function escapeHtml(s: unknown): string;
export function escapeAttr(s: unknown): string;
export function clsx(value: unknown): string;
export function styleString(value: unknown): string;
export function attr(name: string, value: unknown): string;
export function ssgText(v: unknown): string;
export function ssgList<T>(arr: T[], fn: (item: T, index: number) => string): string;
export function ssgComponent(tag: string, props?: Record<string, unknown>, children?: unknown): string;

// ── Server functions (server-functions.js, docs/SERVER_FUNCTIONS.md) ───────────
/** A Standard Schema (https://standardschema.dev): zod, valibot, arktype… */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | { value: Output; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }
      | Promise<{ value: Output; issues?: undefined } | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}
type SchemaInput<S> = S extends StandardSchemaV1<infer I, any> ? I : never;
type SchemaOutput<S> = S extends StandardSchemaV1<any, infer O> ? O : never;

/** What a server function receives besides its input. */
export interface ServerFunctionContext {
  request?: Request;
  url?: URL;
  /** What middleware stored, e.g. the authenticated user. */
  locals: Record<string, unknown>;
  env?: unknown;
  ctx?: unknown;
}

/** A server function: called with its input (and, from server code, a context). */
export type ServerFunction<Input, Output> = (input: Input, context?: Partial<ServerFunctionContext>) => Promise<Awaited<Output>>;

/** A read: idempotent, callable with GET or POST. */
export function query<Output, Input = void>(fn: (input: Input, context: ServerFunctionContext) => Output): ServerFunction<Input, Output>;
export function query<S extends StandardSchemaV1, Output>(schema: S, fn: (input: SchemaOutput<S>, context: ServerFunctionContext) => Output): ServerFunction<SchemaInput<S>, Output>;
/** A write: POST only. */
export function action<Output, Input = void>(fn: (input: Input, context: ServerFunctionContext) => Output): ServerFunction<Input, Output>;
export function action<S extends StandardSchemaV1, Output>(schema: S, fn: (input: SchemaOutput<S>, context: ServerFunctionContext) => Output): ServerFunction<SchemaInput<S>, Output>;
/** `"query"`, `"action"`, or null for anything else. */
export function serverFunctionKind(value: unknown): "query" | "action" | null;
/** The input did not match the function's schema. */
export class ValidationError extends Error {
  issues: Array<{ message: string; path?: PropertyKey[] }>;
}
/** The handler for server function requests, from the build's `{ endpoint: fn }` map. */
export function createServerFunctions(
  endpoints: Record<string, ServerFunction<any, any>>,
  /** Limits on decoded input: body size (default 1 MiB) and nesting depth (default 64). */
  options?: { maxBodyBytes?: number; maxDepth?: number },
): { size: number; handle(request: Request, context?: { locals?: Record<string, unknown>; env?: unknown; ctx?: unknown }): Promise<Response | null> };

/** Mark a route-table entry as rendered in the browser (see the client `clientRoute`). */
export function clientRoute(load?: () => unknown): () => unknown;
/** Whether a route-table entry renders in the browser. */
export function isClientRoute(entry: unknown): boolean;
