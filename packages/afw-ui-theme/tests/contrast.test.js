// The theme's color pairs meet WCAG in both modes: text 4.5:1 (1.4.3), indicators and control
// boundaries 3:1 (1.4.11). Keeps a token tweak from quietly breaking one.
import { describe, expect, test } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

const TOKENS = join(dirname(dirname(fromFileURL(import.meta.url))), "tokens.css");

/** The hex custom properties of the block opened by `selector` (first match). */
function tokens(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum] — every pair the theme puts together.
const PAIRS = [
  ["--afw-ui-ink", "--afw-ui-surface", 4.5],
  ["--afw-ui-ink", "--afw-ui-canvas", 4.5],
  ["--afw-ui-ink", "--afw-ui-raised", 4.5],
  ["--afw-ui-ink", "--afw-ui-subtle", 4.5],
  ["--afw-ui-muted", "--afw-ui-surface", 4.5],
  ["--afw-ui-muted", "--afw-ui-canvas", 4.5],
  ["--afw-ui-muted", "--afw-ui-raised", 4.5],
  ["--afw-ui-accent-ink", "--afw-ui-accent", 4.5], // primary button text
  ["--afw-ui-accent-text", "--afw-ui-surface", 4.5],
  ["--afw-ui-accent-text", "--afw-ui-raised", 4.5], // menu check marks
  ["--afw-ui-danger", "--afw-ui-surface", 4.5], // field errors
  ["--afw-ui-on-danger", "--afw-ui-danger", 4.5], // danger button text
  ["--afw-ui-accent-edge", "--afw-ui-surface", 3], // focus ring, selected tab
  ["--afw-ui-accent-edge", "--afw-ui-raised", 3], // menu item edge
  ["--afw-ui-accent-edge", "--afw-ui-subtle", 3],
  ["--afw-ui-control-border", "--afw-ui-surface", 3], // input/button boundaries
  ["--afw-ui-success", "--afw-ui-raised", 3], // toast tone edges
  ["--afw-ui-warning", "--afw-ui-raised", 3],
  ["--afw-ui-danger", "--afw-ui-raised", 3],
  ["--afw-ui-info", "--afw-ui-raised", 3],
];

describe("theme contrast", () => {
  for (const [mode, selector] of [["light", ":root"], ["dark", '[data-theme="dark"]']]) {
    test(`${mode}: every pair meets its minimum`, async () => {
      const css = await file(TOKENS).text();
      const t = { ...(mode === "dark" ? tokens(css, ":root") : {}), ...tokens(css, selector) };
      const failures = [];
      for (const [fg, bg, min] of PAIRS) {
        expect(t[fg]).toBeDefined();
        expect(t[bg]).toBeDefined();
        const ratio = contrast(t[fg], t[bg]);
        if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      }
      expect(failures).toEqual([]);
    });
  }

  test("the system-preference dark block matches the data-theme one", async () => {
    const css = await file(TOKENS).text();
    expect(tokens(css, ':root:not([data-theme="light"])')).toEqual(tokens(css, '[data-theme="dark"]'));
  });
});
