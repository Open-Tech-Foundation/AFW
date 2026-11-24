import { defineRoute } from "@opentf/afw";

// Prerendered at build time, so the e2e drives server HTML that the client adopts.
export default defineRoute({ render: "static" });
