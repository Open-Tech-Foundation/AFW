/** How a route's pages render. */
export type RenderStrategy =
  /** Rendered on the server for each request; the browser adopts the HTML. */
  | "server"
  /** Built to HTML at build time; the browser adopts it. */
  | "static"
  /** Rendered in the browser. The page module never enters the server bundle. */
  | "client";

/** One page's dynamic params: `{ slug: "hello" }`, or an array for a catch-all segment. */
export type RouteParams = Record<string, string | number | Array<string | number>>;

/** A folder's `_config.js`: applies to its pages and every folder below; the nearest one wins. */
export interface RouteConfig {
  /**
   * How the pages render. Must be a string literal: the build reads it without running
   * the file, since it decides what each bundle contains. Inherited when omitted.
   */
  render?: RenderStrategy;
  /**
   * `client` routes only: `"server"` (the default) runs the route's loaders on the server
   * and sends their data with the page; `"client"` leaves fetching to the page.
   */
  data?: "server" | "client";
  /**
   * `static` dynamic routes only: the params of each page to build. Runs at build time.
   * A matching URL that is not listed renders when it is requested.
   */
  paths?: () => RouteParams[] | Promise<RouteParams[]>;
}

/** Declare a folder's render policy: `export default defineRoute({ render: "static" })`. */
export function defineRoute<T extends RouteConfig>(config: T & Record<Exclude<keyof T, keyof RouteConfig>, never>): T;
