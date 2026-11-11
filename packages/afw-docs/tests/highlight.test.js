// Code-fence highlighting (build/highlight.js): afwc writes each fence as plain
// escaped `language-*` markup, and this pass swaps in @opentf/syntax-highlighter's
// `sh-*` spans in the compiled module — for every compile target.
import { afterAll, describe, expect, test } from "../../afw-cli/tests/harness.js";
import { build } from "runtime:build";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { env, platform } from "runtime:process";
import { Command } from "runtime:system";
import { codeHighlightPlugin } from "../build/code-highlight-plugin.js";
import { closeCompilers, createAfwPlugin } from "../../esdev-plugin-afw/index.js";
import { decodeJsString, encodeJsString, highlightCodeFences } from "../build/highlight.js";

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));
const binary = env.AFWC_BIN || join(root, "target", "debug", platform === "windows" ? "afwc.exe" : "afwc");

/** Compile one MDX source with afwc for `target` ("csr" | "ssg" | "hydrate"). */
async function compile(source, target) {
  await mkdir(join(root, ".cache"), { recursive: true });
  const dir = await makeTempDir({ dir: join(root, ".cache"), prefix: ".afw-highlight-test-" });
  try {
    const page = join(dir, "page.mdx");
    await write(page, source);
    const args = ["build", ...(target === "csr" ? [] : [`--target=${target}`]), page];
    const result = await new Command(binary, { args, stdout: "piped", stderr: "piped" }).output();
    if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
    return new TextDecoder().decode(result.stdout);
  } finally {
    await remove(dir, { recursive: true });
  }
}

/** The fence bodies in a compiled module, decoded back to their HTML. */
const fences = (code) =>
  [...code.matchAll(/<pre class=\\"afw-code-pre\\">([\s\S]*?)<\/pre>/g)].map((m) => decodeJsString(m[1]));

const PAGE = [
  "# Code",
  "",
  "```js app.js",
  'const greeting = "<b>\\\\" + `tick` & \'q\';',
  "// done",
  "```",
  "",
  "```text",
  "plain <words>",
  "```",
  "",
  "```",
  "no language",
  "```",
  "",
].join("\n");

describe("highlightCodeFences on afwc output", () => {
  for (const target of ["csr", "ssg", "hydrate"]) {
    test(`highlights a ${target} module's fences and keeps the code text`, async () => {
      const compiled = await compile(PAGE, target);
      const out = await highlightCodeFences(compiled);
      const [js, text, none] = fences(out);
      expect(js.includes('<code class="language-js"><span class="sh-keyword">const</span>')).toBe(true);
      expect(js.includes('<span class="sh-comment">// done</span>')).toBe(true);
      // The source survives the escape round trip: the tokens' text is the fence text.
      const textOf = (html) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      expect(textOf(js)).toBe('const greeting = "<b>\\\\" + `tick` & \'q\';\n// done');
      // An unknown language and a fence without one stay plain escaped text.
      expect(text).toBe('<code class="language-text">plain &lt;words&gt;</code>');
      expect(none).toBe("<code>no language</code>");
      // Nothing else in the module changes.
      expect(out.replace(/<pre class=\\"afw-code-pre\\">[\s\S]*?<\/pre>/g, "")).toBe(
        compiled.replace(/<pre class=\\"afw-code-pre\\">[\s\S]*?<\/pre>/g, ""),
      );
      expect(out.split("\n").length).toBe(compiled.split("\n").length);
    });
  }

  test("the hydrating module's two copies of a page highlight the same", async () => {
    const out = await highlightCodeFences(await compile(PAGE, "hydrate"));
    const js = fences(out).filter((f) => f.includes("language-js"));
    expect(js.length >= 2).toBe(true);
    expect(new Set(js).size).toBe(1);
  });
});

describe("highlightCodeFences", () => {
  const block = (lang, text) => `"<pre class=\\"afw-code-pre\\"><code class=\\"language-${lang}\\">${text}</code></pre>"`;

  test("returns a module without fences unchanged", async () => {
    const code = 'export default () => "<p>hi</p>";';
    expect(await highlightCodeFences(code)).toBe(code);
  });

  test("highlights every fence in a module", async () => {
    const out = await highlightCodeFences(`a(${block("css", "a { color: red; }")}); b(${block("bash", "echo hi")});`);
    expect(out.includes("sh-property")).toBe(true);
    expect(out.includes('language-bash\\"><span class=\\"sh-')).toBe(true);
    expect(out.startsWith('a("<pre class=\\"afw-code-pre\\"><code class=\\"language-css\\"><span')).toBe(true);
  });

  test("leaves an unknown language as it was", async () => {
    const code = `x(${block("nope", "a &lt; b")});`;
    expect(await highlightCodeFences(code)).toBe(code);
  });

  test("the highlighted HTML is a valid string literal body", async () => {
    const out = await highlightCodeFences(`x = ${block("js", 'let s = \\"a\\\\nb\\";\\nlet t = 1;')};`);
    const literal = out.slice(out.indexOf('"'), out.lastIndexOf('"') + 1);
    const html = JSON.parse(literal);
    expect(html.includes('<span class="sh-string">')).toBe(true);
    expect(html.includes("\n")).toBe(true);
  });
});

describe("JS string literal codec", () => {
  test("decodes the escapes a compiler may write", () => {
    expect(decodeJsString('a\\"b\\\\c\\nd\\te\\u00e9\\x41\\u{1F600}')).toBe('a"b\\c\nd\teéA😀');
  });

  test("encode then decode is the identity", () => {
    const text = 'quote " slash \\ line\nreturn\r tab\t sep\u2028end';
    expect(decodeJsString(encodeJsString(text))).toBe(text);
    expect(JSON.parse(`"${encodeJsString(text)}"`)).toBe(text);
  });
});

describe("codeHighlightPlugin", () => {
  const plugin = codeHighlightPlugin();

  test("is a post transform over .md/.mdx modules", () => {
    expect(plugin.transform.order).toBe("post");
    expect(plugin.transform.filter.id.test("/app/docs/page.mdx")).toBe(true);
    expect(plugin.transform.filter.id.test("/app/docs/page.md")).toBe(true);
    expect(plugin.transform.filter.id.test("/app/page.jsx")).toBe(false);
  });

  test("skips a module that is not compiled JS yet", async () => {
    expect(await plugin.transform.handler("```js\nx\n```", "/a/page.mdx", { type: "mdx" })).toBe(null);
  });

  test("returns the highlighted module as js", async () => {
    const code = '"<pre class=\\"afw-code-pre\\"><code class=\\"language-js\\">let a</code></pre>"';
    const result = await plugin.transform.handler(code, "/a/page.mdx", { type: "js" });
    expect(result.type).toBe("js");
    expect(result.code.includes("sh-keyword")).toBe(true);
  });

  test("returns null when there is nothing to highlight", async () => {
    expect(await plugin.transform.handler("export default 1;", "/a/page.mdx", { type: "js" })).toBe(null);
  });
});

describe("codeHighlightPlugin in an esdev build", () => {
  afterAll(closeCompilers);

  for (const target of ["csr", "ssg"]) {
    test(`highlights a ${target} page after the afw plugin, whatever the list order`, async () => {
      await mkdir(join(root, ".cache"), { recursive: true });
      const dir = await makeTempDir({ dir: join(root, ".cache"), prefix: ".afw-highlight-build-" });
      try {
        const page = join(dir, "page.mdx");
        await write(page, "# Hi\n\n```ts\nconst n: number = 1;\n```\n");
        // Listed first on purpose: the `post` order is what puts it after compile.
        const built = await build({
          input: page,
          platform: "neutral",
          external: [/^@opentf\//],
          plugins: [codeHighlightPlugin(), createAfwPlugin({ target, failOnError: true })],
        });
        try {
          const { output } = await built.generate({ format: "esm" });
          const code = output.find((chunk) => chunk.type === "chunk" && chunk.isEntry).code;
          expect(/language-ts\\?"><span class=\\?"sh-keyword\\?">const/.test(code)).toBe(true);
        } finally {
          await built.close();
        }
      } finally {
        await remove(dir, { recursive: true });
      }
    });
  }
});
