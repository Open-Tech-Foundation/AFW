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
// build/index.js) and the Vite plugin (build/vite.js) both call `highlightModule`, which
// also returns a source map for the swap.

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
  return (await highlightModule(code, "module.js"))?.code ?? code;
}

/**
 * `highlightCodeFences` for a bundler transform: the highlighted module and a source
 * map from it back to `code`, or `null` when nothing changed. The swaps stay inside
 * string literals on their own lines (escaped text has no raw newline), so the map is
 * an identity map whose columns shift after each swapped block — written per token, so
 * positions in the rest of the line stay exact through the bundler's map chain.
 *
 * @param {string} code  The compiled JS of a `.md`/`.mdx` module.
 * @param {string} id  The module id (the map's source).
 * @returns {Promise<{ code: string, map: object } | null>}
 */
export async function highlightModule(code, id) {
  if (!code.includes("afw-code-pre")) return null;
  const blocks = [...code.matchAll(FENCE)];
  if (blocks.length === 0) return null;
  // The hydrating build carries each page's HTML twice; highlight each block once.
  const cache = new Map();
  const highlighted = await Promise.all(
    blocks.map(([block, lang, body]) => {
      if (!cache.has(block)) cache.set(block, highlightBlock(block, lang, body));
      return cache.get(block);
    }),
  );
  const edits = blocks
    .map((match, i) => ({ start: match.index, end: match.index + match[0].length, text: highlighted[i] }))
    .filter((edit) => edit.text !== code.slice(edit.start, edit.end));
  if (edits.length === 0) return null;
  return applyEdits(code, edits, id);
}

/** Splice single-line `edits` (sorted, non-overlapping) into `code`, with a source map. */
function applyEdits(code, edits, source) {
  const VLQ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const vlq = (value) => {
    let n = value < 0 ? (-value << 1) | 1 : value << 1;
    let out = "";
    do {
      let digit = n & 31;
      n >>>= 5;
      if (n > 0) digit |= 32;
      out += VLQ[digit];
    } while (n > 0);
    return out;
  };

  const lines = [];
  let segments = [];
  let genCol = 0;
  let prevGenCol = 0;
  let prevLine = 0;
  let prevCol = 0;
  let line = 0;
  let col = 0;
  const mark = () => {
    segments.push(vlq(genCol - prevGenCol) + "A" + vlq(line - prevLine) + vlq(col - prevCol));
    prevGenCol = genCol;
    prevLine = line;
    prevCol = col;
  };
  // Copy original text, marking each token's start so every column maps exactly.
  const copy = (text) => {
    for (const [token] of text.matchAll(/\n|[^\S\n]+|\w+|[^\w\s]/g)) {
      if (token === "\n") {
        lines.push(segments.join(","));
        segments = [];
        genCol = prevGenCol = 0;
        line++;
        col = 0;
        continue;
      }
      if (!/^\s/.test(token)) mark();
      genCol += token.length;
      col += token.length;
    }
  };

  let out = "";
  let last = 0;
  for (const edit of edits) {
    copy(code.slice(last, edit.start));
    mark(); // the swapped block starts where the original one did
    out += code.slice(last, edit.start) + edit.text;
    genCol += edit.text.length;
    col += edit.end - edit.start;
    last = edit.end;
  }
  copy(code.slice(last));
  out += code.slice(last);
  lines.push(segments.join(","));
  return {
    code: out,
    map: { version: 3, sources: [source], sourcesContent: [code], names: [], mappings: lines.join(";") },
  };
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
