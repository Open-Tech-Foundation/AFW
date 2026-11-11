// The home page's code samples, highlighted with @opentf/syntax-highlighter (the
// same highlighter docs code fences use). Done once, when this module loads — on the
// server for the prerender and in the browser for hydration — so both render the
// same markup; each sample's language comes from its file extension.
import { highlightCode } from "@opentf/syntax-highlighter";
import { codeSamples } from "../home-data.js";

const LANGUAGES = { jsx: "jsx", tsx: "tsx", js: "javascript", ts: "typescript" };

/** `code` as escaped `<span class="sh-*">` HTML, in the language of `file`. */
export async function highlightSample({ code, file }) {
  const language = LANGUAGES[file.split(".").pop()] ?? "javascript";
  return (await highlightCode(code, { language })).html;
}

/** The home page samples, each with its highlighted `html`. */
export const highlightedSamples = await Promise.all(
  codeSamples.map(async (sample) => ({ ...sample, html: await highlightSample(sample) })),
);
