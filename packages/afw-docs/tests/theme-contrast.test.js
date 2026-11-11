// Text colors in the theme meet WCAG AA (4.5:1) against the backgrounds they sit on,
// in both modes. Lighthouse flagged the brand orange as text on white (2.4:1); text
// uses --afw-accent-text instead, and this keeps every pair from drifting back.
import { expect, test } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

const THEME = join(dirname(dirname(fromFileURL(import.meta.url))), "theme", "index.css");

/** The custom properties of the first block opened by `selector`. */
function tokens(css, selector) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n  }", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text token, background token] pairs the theme puts together.
const PAIRS = [
  ["--afw-text", "--afw-bg"],
  ["--afw-text-muted", "--afw-bg"],
  ["--afw-text-muted", "--afw-bg-surface"],
  ["--afw-accent-text", "--afw-bg"],
  ["--afw-accent-text", "--afw-bg-surface"],
  ["--afw-code-text", "--afw-code-bg"],
  ["--afw-code-block-text", "--afw-code-block-bg"],
];

for (const [mode, selector] of [["light", ":root"], ["dark", '[data-theme="dark"]']]) {
  test(`${mode} theme text colors meet 4.5:1`, async () => {
    const t = tokens(await file(THEME).text(), selector);
    const failing = PAIRS
      .map(([fg, bg]) => [fg, bg, contrast(t[fg], t[bg])])
      .filter(([, , ratio]) => !(ratio >= 4.5))
      .map(([fg, bg, ratio]) => `${fg} on ${bg}: ${ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });
}
