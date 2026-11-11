// The title a page without one gets after a client navigation: the shell's.
import { afterEach, describe, expect, test } from "runtime:test";

import { prepareRouteHead, updateRouteHead } from "./head.js";

afterEach(() => (document.head.innerHTML = ""));

describe("the fallback title", () => {
  test("a client-rendered load uses the shell's title", () => {
    document.head.innerHTML = "<title>Shell</title>";
    prepareRouteHead(false);
    updateRouteHead({ title: "Todos" }, "/todos");
    expect(document.title).toBe("Todos");
    updateRouteHead({}, "/");
    expect(document.title).toBe("Shell");
  });

  test("a server-rendered page without a title keeps the shell's as the fallback", () => {
    document.head.innerHTML = "<title>Shell</title>";
    prepareRouteHead(true);
    updateRouteHead({}, "/other");
    expect(document.title).toBe("Shell");
  });

  test("a server-rendered page with its own title falls back to the afw-shell-title the server kept", () => {
    document.head.innerHTML = '<meta name="afw-shell-title" content="Shell"><title data-afw-head="">Todos</title>';
    prepareRouteHead(true);
    updateRouteHead({}, "/");
    expect(document.title).toBe("Shell");
    expect(document.head.querySelector('meta[name="afw-shell-title"]')).not.toBe(null); // kept for later navigations
  });
});
