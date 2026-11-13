import { defineRoute } from "@opentf/afw";

// How the pages in app/ render: "server" (per request), "static" (once, at build time) or
// "client" (in the browser). A folder's own _config.ts sets it for that folder and
// the folders below it; the nearest one wins.
export default defineRoute({ render: "static" });
