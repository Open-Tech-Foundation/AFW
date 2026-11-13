import { defineRoute } from "@opentf/afw";

// The site is prerendered: every page is built once, at build time.
export default defineRoute({ render: "static" });
