// Types for the modules `@opentf/esdev-plugin-afw` provides to app code, and the
// imports esdev bundles. Add to tsconfig.json: `"types": ["@opentf/esdev-plugin-afw/client"]`.

declare module "@afw/routes" {
  /** Page, layout and 404 modules under `app/`, keyed by `/app/...` path, loaded lazily. */
  export const pages: Record<string, () => Promise<unknown>>;
  /** Route patterns that have a server loader (`loader.js` beside the page). */
  export const loaderRoutes: string[];
  /** The default export of `app/routeGuard.{js,ts}`, when there is one. */
  export const guard: ((to: unknown, from: unknown) => unknown) | undefined;
}

declare module "*.md" {
  /** A Markdown page compiles to a page factory. */
  const page: (props?: Record<string, unknown>) => Node;
  export default page;
}

declare module "*.mdx" {
  const page: (props?: Record<string, unknown>) => Node;
  export default page;
}

/** A stylesheet import (`import "./app/global.css"`): esdev bundles it beside the page. */
declare module "*.css" {}
