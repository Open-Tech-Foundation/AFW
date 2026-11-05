import { defineCollection, defineContentConfig } from "@nuxt/content";

// The docs pages: content/docs/<slug>.md, served at /docs/<slug>.
export default defineContentConfig({
  collections: { docs: defineCollection({ type: "page", source: "docs/*.md" }) },
});
