// `$id()` on the client (SPEC §3.6): `componentId(n)` suffixes the running host's base —
// the server-stamped `data-afw-uid` when it has one, else a fresh client `c` base.

import { describe, expect, test } from "runtime:test";

import { enterHost, exitHost } from "../core/context.js";
import { componentId } from "./id.js";

function inHost(host, fn) {
  enterHost(host);
  try {
    return fn();
  } finally {
    exitHost();
  }
}

describe("componentId", () => {
  test("a server-rendered host reuses its stamped base", () => {
    const host = document.createElement("div");
    host.setAttribute("data-afw-uid", "s4");
    expect(inHost(host, () => [componentId(0), componentId(1)])).toEqual(["afw-s4-0", "afw-s4-1"]);
  });

  test("a client-built host gets one fresh base, kept when its body runs again", () => {
    const host = document.createElement("div");
    const first = inHost(host, () => componentId(0));
    expect(first).toMatch(/^afw-c\d+-0$/);
    expect(inHost(host, () => componentId(0))).toBe(first); // a rebuild keeps its ids
    expect(inHost(host, () => componentId(1))).toBe(first.replace(/-0$/, "-1"));
  });

  test("two hosts never share ids", () => {
    const a = inHost(document.createElement("div"), () => componentId(0));
    const b = inHost(document.createElement("div"), () => componentId(0));
    expect(a).not.toBe(b);
  });

  test("the innermost host owns the id while hosts nest", () => {
    const outer = document.createElement("div");
    outer.setAttribute("data-afw-uid", "s1");
    const inner = document.createElement("div");
    inner.setAttribute("data-afw-uid", "s2");
    const ids = inHost(outer, () => [componentId(0), inHost(inner, () => componentId(0)), componentId(1)]);
    expect(ids).toEqual(["afw-s1-0", "afw-s2-0", "afw-s1-1"]);
  });

  test("outside any host it still returns a unique client id", () => {
    expect(componentId(0)).not.toBe(componentId(0));
  });
});
