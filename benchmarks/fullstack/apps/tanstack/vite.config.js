import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import remarkGfm from "remark-gfm";

export default {
  // The order of TanStack's Tailwind guide: tailwindcss() last.
  plugins: [{ enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm] }) }, tanstackStart(), nitro(), react(), tailwindcss()],
};
