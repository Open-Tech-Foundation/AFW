import { defineDocsConfig } from "@opentf/afw-docs/config";

export default defineDocsConfig({
  // Your site's URL: canonical links, sitemap.xml and llms.txt use it.
  site: { url: "https://example.com" },
  docs: {
    title: "{{name}}",
    nav: [
      { label: "Docs", href: "/docs" },
    ],
    search: { provider: "afw" },
  },
});
