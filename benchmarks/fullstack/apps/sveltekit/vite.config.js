import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { mdsvex } from "mdsvex";

// SvelteKit 3: the config lives in the sveltekit() plugin; mdsvex turns .md routes into Svelte.
export default {
  plugins: [
    tailwindcss(),
    sveltekit({ adapter: adapter(), extensions: [".svelte", ".md"], preprocess: [mdsvex({ extensions: [".md"] })] }),
  ],
};
