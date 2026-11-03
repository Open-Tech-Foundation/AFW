import { defineDocsConfig } from "@opentf/afw-docs/config";

export default defineDocsConfig({
  site: { url: "https://docs.example" },
  docs: {
    title: "Fixture Docs",
    lastUpdated: true,
    nav: [{ label: "Docs", href: "/docs" }, { label: "Blog", href: "/blog" }],
    search: { provider: "afw" },
  },
  blog: { dir: "blog", lastUpdated: true, title: "Fixture Blog" },
});
