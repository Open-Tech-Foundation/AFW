import { defineDocsConfig } from "@opentf/afw-docs/config";

export default defineDocsConfig({
  // Your site's URL: canonical links, sitemap.xml, feeds and llms.txt use it.
  site: { url: "https://example.com" },
  docs: {
    title: "{{name}}",
    nav: [
      { label: "Docs", href: "/docs" },
      { label: "Blog", href: "/blog" },
    ],
    search: { provider: "afw" },
  },
  blog: { dir: "blog", title: "{{name}} Blog" },
});
