// The home page's code samples, highlighted with @opentf/syntax-highlighter.
//
// Nothing here may hold up hydration:
// - Prerender (no `document`): each sample's `html` is highlighted, so the page's
//   first paint already has colors, with or without JavaScript.
// - Browser: `html` is the plain escaped code and nothing is awaited. Hydration
//   adopts the prerendered (colored) markup as is; when the hero is rendered in the
//   browser instead (client-side navigation), CodeShowcase colors it after mount by
//   loading the highlighter in the background — like a stylesheet arriving late.
import { codeSamples } from "../home-data.js";

const LANGUAGES = { jsx: "jsx", tsx: "tsx", js: "javascript", ts: "typescript" };

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `code` as escaped `<span class="sh-*">` HTML, in the language of `file`. */
export async function highlightSample({ code, file }) {
  const { highlightCode } = await import("@opentf/syntax-highlighter");
  const language = LANGUAGES[file.split(".").pop()] ?? "javascript";
  return (await highlightCode(code, { language })).html;
}

/** The home page samples, each with its `html`: highlighted when prerendering, plain in the browser. */
export const heroSamples = typeof document === "undefined"
  ? await Promise.all(codeSamples.map(async (sample) => ({ ...sample, html: await highlightSample(sample) })))
  : codeSamples.map((sample) => ({ ...sample, html: escapeHtml(sample.code) }));
