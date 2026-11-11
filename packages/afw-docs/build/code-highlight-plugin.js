// `codeHighlightPlugin` — the esdev half of docs code highlighting (see highlight.js).
// A `post` transform, so it sees each `.md`/`.mdx` module after the afw plugin has
// compiled it to JS, whatever order the plugins are listed in.

import { FENCE_SOURCE, highlightModule } from "./highlight.js";

/** esdev plugin: highlight the code fences of compiled `.md`/`.mdx` pages. */
export function codeHighlightPlugin() {
  return {
    name: "afw-docs-highlight",
    transform: {
      order: "post",
      filter: { id: FENCE_SOURCE },
      async handler(code, id, ctx) {
        // Still Markdown means the afw plugin has not compiled it: not ours to touch.
        if (ctx?.type && ctx.type !== "js") return null;
        // With a source map for the swap, so the bundler's map chain stays exact (and
        // esdev does not warn SOURCEMAP_BROKEN).
        const out = await highlightModule(code, id);
        return out && { code: out.code, map: out.map, type: "js" };
      },
    },
  };
}
