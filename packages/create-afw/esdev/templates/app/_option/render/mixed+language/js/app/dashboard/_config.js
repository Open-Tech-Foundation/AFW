import { defineRoute } from "@opentf/afw";

// Rendered in the browser: the server sends the layout and this folder's loader data,
// and never loads its pages, so they may use browser-only code.
export default defineRoute({ render: "client" });
