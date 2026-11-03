import afw from "@opentf/vite-plugin-afw";
import afwDocs from "@opentf/afw-docs/vite";

export default { plugins: [afw({ mode: "ssg" }), afwDocs()] };
