import { defineRoute } from "@opentf/afw";

// Every page renders per request.
export default defineRoute({ render: "server" });
