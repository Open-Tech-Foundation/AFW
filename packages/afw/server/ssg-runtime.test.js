// Unit tests for the SSG runtime's hydration-props collector (docs/HYDRATION.md §3.7):
// `ssgComponent` stamps each island a `data-h` id and records its JSON-safe props into a
// payload the client reads at upgrade. No DOM — plain string building.

import { afterEach, describe, expect, test } from "runtime:test";

import { setRenderContextReader } from "../core/render-context.js";
import {
  beginHydrationCollect,
  componentId,
  defineSSG,
  endHydrationCollect,
  ssgAttrs,
  ssgComponent,
  paragraphBlockTag,
  ssgParagraph,
  ssgText,
} from "./ssg-runtime.js";

// A render fn as the SSG backend emits: props → inner HTML, with a stable host class.
function register(tag, render) {
  render.hostClass = "hook-" + tag;
  defineSSG(tag, render);
  return tag;
}

afterEach(() => {
  endHydrationCollect(); // clear any collector left open by a failing test
});

describe("ssgComponent + hydration collector", () => {
  test("stamps a data-h id and serializes rich props into the payload", () => {
    const tag = register("afw-badge", (p) => `<span>${p.meta.text}</span>`);
    beginHydrationCollect();
    const html = ssgComponent(tag, { meta: { text: "hi", n: 7 } }, "");
    const payload = endHydrationCollect();

    expect(html).toMatch(/<afw-badge class="hook-afw-badge" data-h="0">/);
    expect(html).not.toContain("meta="); // the rich prop is NOT a host attribute
    expect(JSON.parse(payload)).toEqual([{ meta: { text: "hi", n: 7 } }]);
  });

  test("assigns ids in call order across multiple islands", () => {
    const a = register("afw-a", () => "A");
    const b = register("afw-b", () => "B");
    beginHydrationCollect();
    const html = ssgComponent(a, { x: 1 }, "") + ssgComponent(b, { y: 2 }, "");
    const payload = endHydrationCollect();

    expect(html).toContain('data-h="0"');
    expect(html).toContain('data-h="1"');
    expect(JSON.parse(payload)).toEqual([{ x: 1 }, { y: 2 }]);
  });

  test("names function props, which cannot serialize, so the client waits for them", () => {
    const tag = register("afw-cb", () => "x");
    beginHydrationCollect();
    const html = ssgComponent(tag, { onClick: () => {}, onInput: () => {} }, "");
    const payload = endHydrationCollect();

    // Only callbacks: the island still gets an id, and the payload lists their names.
    expect(html).toContain('data-h="0"');
    expect(JSON.parse(payload)).toEqual([{ __afwFn: ["onClick", "onInput"] }]);
  });

  test("keeps serializable props and names the callbacks alongside them", () => {
    const tag = register("afw-mix", () => "x");
    beginHydrationCollect();
    ssgComponent(tag, { label: "hi", onClick: () => {} }, "");
    expect(JSON.parse(endHydrationCollect())).toEqual([{ label: "hi", __afwFn: ["onClick"] }]);
  });

  test("a component without function props gets no __afwFn", () => {
    const tag = register("afw-plain", () => "x");
    beginHydrationCollect();
    ssgComponent(tag, { label: "hi" }, "");
    expect(JSON.parse(endHydrationCollect())).toEqual([{ label: "hi" }]);
  });

  test("carries props inline when rendered outside a render (no beginHydrationCollect)", () => {
    // Module-level JSX-as-value (`export const tabs = [{ content: <CodeBlock/> }]`) renders
    // at import time, before any collect bracket: there is no payload to key an id into, so
    // the props ride on the host and the markup stays self-contained wherever it is spliced.
    const tag = register("afw-off", () => "x");
    const html = ssgComponent(tag, { label: "hi" }, "");
    expect(html).not.toContain("data-h=");
    expect(html).toContain('data-hp="{&quot;label&quot;:&quot;hi&quot;}"');
    expect(endHydrationCollect()).toBe(""); // nothing was collecting
  });

  test("an inline prop value can't break out of its attribute", () => {
    const tag = register("afw-off-xss", () => "x");
    const html = ssgComponent(tag, { s: '"><img src=x onerror=alert(1)>' }, "");
    expect(html).not.toContain("<img");
    // The quote that would close the attribute and the `<` that would start a tag are
    // both entities, so the whole value stays inside `data-hp="…"`.
    expect(html.match(/data-hp="[^"]*"/)[0]).toContain("\\&quot;>&lt;img");
  });

  test("escapes `<` so a prop value can't break out of the payload <script>", () => {
    const tag = register("afw-xss", () => "x");
    beginHydrationCollect();
    ssgComponent(tag, { s: "</script><!--" }, "");
    const payload = endHydrationCollect();
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c/script>");
    expect(JSON.parse(payload)).toEqual([{ s: "</script><!--" }]); // still valid JSON
  });

  test("a cyclic / non-serializable prop object yields no id (client falls back)", () => {
    const tag = register("afw-cyc", () => "x");
    const cyclic = {};
    cyclic.self = cyclic;
    beginHydrationCollect();
    const html = ssgComponent(tag, cyclic, "");
    expect(html).not.toContain("data-h");
    expect(endHydrationCollect()).toBe("");
  });

  test("a renderer's hostAttrs land on the host tag", () => {
    // The escape hatch built-ins need when an attribute has to be in the served
    // HTML before any script runs — see `afw-internal-context-provider`, resolved
    // by `closest()` at custom-element upgrade time (server/builtins.js).
    const render = (_p, children) => children;
    render.hostAttrs = (p) => (p.context ? ` data-afw-ctx="${p.context.id}"` : "");
    defineSSG("afw-hostattrs", render);
    expect(ssgComponent("afw-hostattrs", { context: { id: "afw-ctx-3" } }, "x")).toContain(
      'data-afw-ctx="afw-ctx-3"',
    );
    expect(ssgComponent("afw-hostattrs", {}, "x")).not.toContain("data-afw-ctx");
  });
});

describe("built-in SSG renderers", () => {
  test("ContextProvider publishes its context id as a host attribute", async () => {
    // Without this attribute in the markup, consumer elements — which upgrade before
    // the enclosing component's hydrate code assigns the `context` prop — resolve no
    // provider and silently bind to the context default for the life of the page.
    await import("./builtins.js");
    const html = ssgComponent(
      "afw-internal-context-provider",
      { context: { id: "afw-ctx-0" }, value: "high-contrast" },
      "<span>x</span>",
    );
    expect(html).toContain('data-afw-ctx="afw-ctx-0"');
    expect(html).toContain("<span>x</span>");
  });
});

describe("ssgText", () => {
  test("nullish / boolean holes render empty", () => {
    for (const v of [null, undefined, false, true]) expect(ssgText(v)).toBe("");
  });

  test("escapes plain text but passes {__html} through raw", () => {
    expect(ssgText("<b>hi</b>")).toBe("&lt;b&gt;hi&lt;/b&gt;");
    expect(ssgText({ __html: "<b>hi</b>" })).toBe("<b>hi</b>");
    expect(ssgText(42)).toBe("42");
  });

  // Regression: an inline array hole (`{[<a/>, <b/>]}` or `{[1,2,3]}`) used to fall
  // through to `String(v)` → "[object Object]" / comma-joined text. It must render
  // each item concatenated with no separator, mirroring CSR's toNodes/bindText so the
  // hydrated client render matches the server HTML.
  test("an array of JSX holes concatenates each item's HTML (no [object Object])", () => {
    const out = ssgText([{ __html: "<span>A</span>" }, { __html: "<span>B</span>" }]);
    expect(out).toBe("<span>A</span><span>B</span>");
    expect(out).not.toContain("[object Object]");
  });

  test("an array of primitives concatenates with no separator (matches CSR)", () => {
    expect(ssgText([1, 2, 3])).toBe("123");
    expect(ssgText(["a", null, "b", false])).toBe("ab"); // nullish/false items drop out
  });

  test("nested arrays flatten and text items stay escaped", () => {
    expect(ssgText([["<x>", { __html: "<i>ok</i>" }], "y"])).toBe("&lt;x&gt;<i>ok</i>y");
  });
});

describe("ssgAttrs", () => {
  test("merges spreads and named attributes, later entries winning", () => {
    expect(ssgAttrs([["id", "a"], { id: "b", title: "t" }, ["class", "base"]])).toBe(
      ' id="b" title="t" class="base"',
    );
    expect(ssgAttrs([["class", "base"], { class: ["x", { y: true }] }])).toBe(' class="x y"');
  });

  test("drops handlers, ref, children and empty values", () => {
    const out = ssgAttrs([
      { onclick: () => {}, ref: {}, children: "c", hidden: false, title: null, open: true },
    ]);
    expect(out).toBe(" open");
  });

  test("tolerates a null or undefined spread", () => {
    expect(ssgAttrs([null, undefined, ["id", "x"]])).toBe(' id="x"');
  });
});

describe("ssgParagraph", () => {
  test("finds a block tag a component put in a paragraph, and nothing in inline markup", () => {
    expect(paragraphBlockTag('a <x-badge><span>b</span></x-badge> c')).toBe(null);
    expect(paragraphBlockTag('a <x-box><DIV class="d">b</DIV></x-box>')).toBe("div");
    expect(paragraphBlockTag("<x-l><ul><li>i</li></ul></x-l>")).toBe("ul");
    expect(paragraphBlockTag("<x-h><h2>t</h2></x-h>")).toBe("h2");
    // <picture> and <param> start with "p" but don't close a paragraph.
    expect(paragraphBlockTag("<x-i><picture></picture><param></x-i>")).toBe(null);
  });

  test("returns the paragraph's HTML unchanged either way", () => {
    for (const html of ["a <x-b><span>b</span></x-b>", "a <x-b><div>b</div></x-b>"]) {
      expect(ssgParagraph(html, "<B>")).toBe(html);
    }
  });
});

// `$id()` on the server (SPEC §3.6): the compiled body calls `componentId(n)`; the
// host it renders inside gets one base, stamped as `data-afw-uid` for the client.
describe("componentId", () => {
  const readerOff = () => setRenderContextReader(() => undefined);
  afterEach(readerOff);

  test("one base per host, stamped on it, and suffixed per call", () => {
    const tag = register("afw-idfield", () => `<label for="${componentId(0)}"></label><p id="${componentId(1)}"></p>`);
    const html = ssgComponent(tag, {}, "");
    const base = html.match(/data-afw-uid="(m\d+)"/)[1];
    expect(html).toContain(`for="afw-${base}-0"`);
    expect(html).toContain(`id="afw-${base}-1"`);
  });

  test("a host whose body never calls $id() gets no attribute", () => {
    const tag = register("afw-noid", () => "<i></i>");
    expect(ssgComponent(tag, {}, "")).not.toContain("data-afw-uid");
  });

  test("nested hosts get their own bases, and the parent's ids stay its own", () => {
    const child = register("afw-idchild", () => `<b id="${componentId(0)}"></b>`);
    const parent = register("afw-idparent", () => {
      const before = componentId(0);
      const inner = ssgComponent(child, {}, "");
      return `<i id="${before}"></i>${inner}<u id="${componentId(1)}"></u>`;
    });
    const html = ssgComponent(parent, {}, "");
    const [outer, inner] = [...html.matchAll(/data-afw-uid="(\w+)"/g)].map((m) => m[1]);
    expect(outer).not.toBe(inner);
    expect(html).toContain(`<i id="afw-${outer}-0">`);
    expect(html).toContain(`<b id="afw-${inner}-0">`);
    expect(html).toContain(`<u id="afw-${outer}-1">`); // after the child, still the parent's base
  });

  test("a route render counts bases per request, apart from process-wide ones", () => {
    const tag = register("afw-idreq", () => `<p id="${componentId(0)}"></p>`);
    let context = {};
    setRenderContextReader(() => context);
    const first = ssgComponent(tag, {}, "") + ssgComponent(tag, {}, "");
    context = {}; // the next request
    const second = ssgComponent(tag, {}, "");
    expect(first).toContain('data-afw-uid="s0"');
    expect(first).toContain('data-afw-uid="s1"');
    expect(second).toContain('data-afw-uid="s0"'); // deterministic per request
    readerOff();
    expect(ssgComponent(tag, {}, "")).toMatch(/data-afw-uid="m\d+"/); // never an `s` base
  });

  test("a call outside any host still yields a unique id", () => {
    expect(componentId(0)).not.toBe(componentId(0));
  });
});
