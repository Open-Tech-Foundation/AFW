import { defineRoute } from "@opentf/afw";

// Built once at build time; the rest of the app renders per request.
export default defineRoute({ render: "static" });
