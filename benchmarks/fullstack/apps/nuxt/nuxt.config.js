import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  modules: ["@nuxt/content"],
  css: ["~/assets/main.css"],
  vite: { plugins: [tailwindcss()] },
  // Node's built-in SQLite for Nuxt Content's database (no native module to install).
  content: { experimental: { sqliteConnector: "native" } },
  app: { head: { title: "Store" } },
  telemetry: false,
  devtools: { enabled: false },
  compatibilityDate: "2026-11-01",
});
