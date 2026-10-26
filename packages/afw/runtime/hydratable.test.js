// JSX passed as a value (a prop, module data, or a component's children read as a value)
// lands in another component's text hole. During hydration that hole keeps the server's
// nodes and adopts them when the value describes them; otherwise it builds.

import { afterEach, describe, expect, test } from "runtime:test";

import { signal } from "../core/signals.js";
import { adoptedChildren, bindText, hydratableNode } from "./dom.js";
import { beginHydration, claimElement, claimText, cursor, endHydration, HydrationMismatch } from "./hydrate.js";

afterEach(() => endHydration());

// A `<div>` holding one text hole whose server content is `inner`.
function hole(inner) {
  const host = document.createElement("div");
  host.innerHTML = `<!--$-->${inner}<!--/-->`;
  return { host, anchor: claimText(cursor(host)) };
}

function paragraph(text) {
  const p = document.createElement("p");
  p.className = "x";
  p.textContent = text;
  return p;
}

describe("claimText", () => {
  test("returns the server text node for a text value", () => {
    const host = document.createElement("div");
    host.innerHTML = "<!--$-->hello<!--/-->";
    const serverText = host.childNodes[1];
    expect(claimText(cursor(host))).toBe(serverText);
  });

  test("keeps node-valued server content in place for the binding", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    const p = host.querySelector("p.x");
    expect(p).toBeTruthy();
    expect(anchor.nodeType).toBe(Node.TEXT_NODE);
    expect(anchor.data).toBe("");
    expect(p.nextSibling).toBe(anchor);
  });
});

describe("bindText with server content", () => {
  test("the server's { __html } stand-in keeps the server nodes", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    const p = host.querySelector("p.x");
    bindText(anchor, () => ({ __html: '<p class="x">server</p>' }));
    expect(host.querySelectorAll("p.x").length).toBe(1);
    expect(host.querySelector("p.x")).toBe(p);
  });

  test("a hydratable value adopts the server nodes during hydration", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    const p = host.querySelector("p.x");
    let built = 0;
    const adoptedWith = [];
    beginHydration();
    bindText(anchor, () => hydratableNode(
      () => { built++; return paragraph("built"); },
      (cur, nodes) => { adoptedWith.push(nodes); return claimElement(cur, "p"); },
    ));
    endHydration();
    expect(built).toBe(0);
    expect(adoptedWith[0]).toEqual([p]);
    expect(host.querySelector("p.x")).toBe(p);
  });

  test("a hydratable value arriving after the stand-in adopts the same nodes", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    const p = host.querySelector("p.x");
    const value = signal({ __html: '<p class="x">server</p>' });
    beginHydration();
    bindText(anchor, () => value.value);
    let adopted = 0;
    value.value = hydratableNode(() => paragraph("built"), (cur) => { adopted++; return claimElement(cur, "p"); });
    endHydration();
    expect(adopted).toBe(1);
    expect(host.querySelector("p.x")).toBe(p);
    expect(host.querySelectorAll("p.x").length).toBe(1);
  });

  test("a mismatching adopt falls back to building, without a duplicate", () => {
    const { host, anchor } = hole('<span class="x">server</span>');
    beginHydration();
    bindText(anchor, () => hydratableNode(() => paragraph("built"), (cur) => claimElement(cur, "p")));
    endHydration();
    expect(host.querySelector("span.x")).toBe(null);
    expect(host.querySelectorAll("p.x").length).toBe(1);
    expect(host.querySelector("p.x").textContent).toBe("built");
  });

  test("an error other than a mismatch is not swallowed", () => {
    const { anchor } = hole('<p class="x">server</p>');
    beginHydration();
    expect(() => bindText(anchor, () => hydratableNode(() => paragraph("built"), () => { throw new TypeError("boom"); })))
      .toThrow(TypeError);
  });

  test("outside hydration a hydratable value builds and replaces the server nodes", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    bindText(anchor, () => hydratableNode(() => paragraph("built"), () => { throw new Error("must not adopt"); }));
    expect(host.querySelectorAll("p.x").length).toBe(1);
    expect(host.querySelector("p.x").textContent).toBe("built");
  });

  test("a text value replaces node-valued server content", () => {
    const { host, anchor } = hole('<p class="x">server</p>');
    bindText(anchor, () => "plain");
    expect(host.querySelector("p.x")).toBe(null);
    expect(host.textContent).toBe("plain");
  });

  test("an empty hole binds as before", () => {
    const { host, anchor } = hole("");
    bindText(anchor, () => "late");
    expect(host.textContent).toBe("late");
  });
});

describe("hydratableNode and adoptedChildren", () => {
  test("a hydratable value builds fresh nodes on every render outside hydration", () => {
    const value = hydratableNode(() => paragraph("built"), () => null);
    const a = document.createElement("div");
    const b = document.createElement("div");
    a.append(document.createTextNode(""));
    b.append(document.createTextNode(""));
    bindText(a.firstChild, () => value);
    bindText(b.firstChild, () => value);
    expect(a.querySelector("p.x")).not.toBe(b.querySelector("p.x"));
  });

  test("adoptedChildren keeps the nodes it adopts and builds them again later", () => {
    const { host, anchor } = hole('<b class="slotted">kids</b>');
    const kids = host.querySelector("b.slotted");
    const children = adoptedChildren();
    const show = signal(true);
    beginHydration();
    bindText(anchor, () => (show.value ? children : ""));
    endHydration();
    expect(host.querySelector("b.slotted")).toBe(kids);
    show.value = false;
    expect(host.querySelector("b.slotted")).toBe(null);
    show.value = true;
    expect(host.querySelector("b.slotted")).toBe(kids);
  });

  test("adoptedChildren renders nothing before it adopts", () => {
    const host = document.createElement("div");
    host.append(document.createTextNode(""));
    bindText(host.firstChild, () => adoptedChildren());
    expect(host.textContent).toBe("");
    expect(host.children.length).toBe(0);
  });

  test("HydrationMismatch is the error a failed adopt raises", () => {
    const host = document.createElement("div");
    host.innerHTML = "<span></span>";
    expect(() => claimElement(cursor(host), "p")).toThrow(HydrationMismatch);
  });
});
