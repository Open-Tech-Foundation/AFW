import mdx from "@mdx-js/rollup";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import remarkGfm from "remark-gfm";

// SolidStart's MDX template: MDX compiled to Solid JSX, .mdx files as routes.
export default {
  plugins: [
    { ...mdx({ jsx: true, jsxImportSource: "solid-js", providerImportSource: "solid-mdx", remarkPlugins: [remarkGfm] }), enforce: "pre" },
    solidStart({ extensions: ["jsx", "js", "mdx"], middleware: "./src/middleware.js" }),
    tailwindcss(),
    nitro(),
  ],
};
