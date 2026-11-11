// `codeHighlightPlugin` — the esdev half of docs code highlighting (see highlight.js).
// A `post` transform, so it sees each `.md`/`.mdx` module after the afw plugin has
// compiled it to JS, whatever order the plugins are listed in.

import { FENCE_SOURCE, highlightCodeFences } from "./highlight.js";

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
        const out = await highlightCodeFences(code);
        return out === code ? null : { code: out, type: "js" };
      },
    },
  };
}
