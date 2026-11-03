import type { Server } from "node:http";

type Handler = (request: Request) => Promise<Response>;

/** A `files` step serving the built client (`null` passes to the next step). */
export function staticFiles(clientDir: string | URL, options?: { html?: boolean }): (request: Request) => Promise<Response | null>;
/** An SPA fallback: built files, else `index.html` for page navigations, else 404. */
export function staticFallback(clientDir: string | URL): (request: Request) => Promise<Response>;
/** Start the built app on Node. */
export function startServer(options: {
  app?: {
    createHandler: (options: { files?: unknown; renderPage?: unknown; fallback?: unknown }) => Handler;
    createPageRenderer?: (options: { shell: string; baseUrl?: string }) => unknown;
  };
  createHandler?: (options: { files?: unknown; renderPage?: unknown; fallback?: unknown }) => Handler;
  clientDir: string | URL;
  mode?: "spa" | "ssg" | "ssr";
  baseUrl?: string;
  port?: number;
  host?: string;
}): Promise<Server>;
