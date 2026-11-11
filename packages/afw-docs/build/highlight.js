// Code-fence highlighting for docs and blog pages, with @opentf/syntax-highlighter.
//
// afwc lowers a Markdown fence to a plain, escaped block —
// `<pre class="afw-code-pre"><code class="language-js">…</code></pre>` — inside the
// HTML string of the page's `CodeFence`. This pass runs on the *compiled* module,
// after afwc, and swaps each block's text for highlighted `<span class="sh-*">`
// markup. The module itself then carries the colors, so a prerendered page and a
// page rendered after client-side navigation show the same highlighted code (and
// hydration adopts the same HTML), with no highlighter shipped to the browser.
//
// Toolchain-neutral: no `runtime:`/`node:` imports. `codeHighlightPlugin` (esdev,
// build/index.js) and the Vite plugin (build/vite.js) both call `highlightCodeFences`.

import { highlightCode } from "@opentf/syntax-highlighter";

/** Compiled `.md`/`.mdx` modules — the only ones afwc writes code fences into. */
export const FENCE_SOURCE = /\.mdx?$/;

// One fence's block as it sits inside a double-quoted JS string literal: the quotes
// around attribute values are escaped (`\"`). Its text holds no `<` (HTML-escaped),
// so the lazy match cannot run past its own `</code>`.
const FENCE = /<pre class=\\"afw-code-pre\\"><code class=\\"language-([^"\\<>]+)\\">([^<]*)<\/code><\/pre>/g;

const HTML_ENTITIES = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" };

/** Undo the HTML escaping afwc applied to the fence text. */
function htmlUnescape(text) {
  return text.replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => HTML_ENTITIES[entity]);
}

const SIMPLE_ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" };

/** Decode the body of a JS string literal (the part between its quotes). */
export function decodeJsString(body) {
  return body.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r\n|[\s\S])/g, (_, esc, cp, u4, x2) => {
    if (cp) return String.fromCodePoint(parseInt(cp, 16));
    if (u4 || x2) return String.fromCharCode(parseInt(u4 ?? x2, 16));
    if (esc === "\n" || esc === "\r\n" || esc === "\u2028" || esc === "\u2029") return ""; // line continuation
    return SIMPLE_ESCAPES[esc] ?? esc;
  });
}

/** Encode text as the body of a double-quoted JS string literal. */
export function encodeJsString(text) {
  return text.replace(/[\\"\n\r\t\u2028\u2029]/g, (c) =>
    c === "\\" ? "\\\\"
    : c === '"' ? '\\"'
    : c === "\n" ? "\\n"
    : c === "\r" ? "\\r"
    : c === "\t" ? "\\t"
    : c === "\u2028" ? "\\u2028"
    : "\\u2029",
  );
}

/**
 * Highlight every code fence in a compiled module. A fence in a language the
 * highlighter does not know (or one that fails) keeps its plain text; a fence with
 * no language has no `language-*` class and is never touched.
 *
 * @param {string} code  The compiled JS of a `.md`/`.mdx` module.
 * @returns {Promise<string>} The module with highlighted fences (`code` itself when
 *   there was nothing to highlight).
 */
export async function highlightCodeFences(code) {
  if (!code.includes("afw-code-pre")) return code;
  const blocks = [...code.matchAll(FENCE)];
  if (blocks.length === 0) return code;
  // The hydrating build carries each page's HTML twice; highlight each block once.
  const cache = new Map();
  const highlighted = await Promise.all(
    blocks.map(([block, lang, body]) => {
      if (!cache.has(block)) cache.set(block, highlightBlock(block, lang, body));
      return cache.get(block);
    }),
  );
  let out = "";
  let last = 0;
  blocks.forEach((match, i) => {
    out += code.slice(last, match.index) + highlighted[i];
    last = match.index + match[0].length;
  });
  return out + code.slice(last);
}

async function highlightBlock(block, lang, body) {
  try {
    const source = htmlUnescape(decodeJsString(body));
    const { html, language } = await highlightCode(source, { language: htmlUnescape(lang) });
    if (!language) return block;
    return `<pre class=\\"afw-code-pre\\"><code class=\\"language-${lang}\\">${encodeJsString(html)}</code></pre>`;
  } catch {
    return block;
  }
}
