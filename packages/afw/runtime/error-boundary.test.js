import { describe, expect, test } from "runtime:test";

import { hydratableNode } from "./dom.js";
import "./error-boundary.js";

const tick = () => new Promise((resolve) => queueMicrotask(resolve));

/** A connected boundary that has caught `message`, with `fallback` set. */
async function failWith(fallback, message = "boom") {
  const boundary = document.createElement("afw-internal-error-boundary");
  boundary.fallback = fallback;
  boundary.appendChild(document.createElement("p"));
  document.body.appendChild(boundary);
  boundary.catch(new Error(message));
  await tick();
  return boundary;
}

describe("ErrorBoundary fallback values", () => {
  test("a compiled JSX value renders its nodes, with the error and reset in scope", async () => {
    let resets = 0;
    const boundary = await failWith((error, reset) => hydratableNode(() => {
      const div = document.createElement("div");
      div.className = "custom";
      div.textContent = `Oops ${error.message}`;
      div.onclick = () => { resets++; reset(); };
      return div;
    }, () => null));
    expect(boundary.querySelector("[data-afw-fallback]")).toBe(null); // not the built-in alert
    expect(boundary.querySelector(".custom").textContent).toBe("Oops boom");
    boundary.querySelector(".custom").click();
    expect(resets).toBe(1);
    boundary.remove();
  });

  test("a node renders as is", async () => {
    const node = document.createElement("section");
    const boundary = await failWith(() => node);
    expect(boundary.firstChild).toBe(node);
    boundary.remove();
  });

  test("an array (a fragment) renders every node in order", async () => {
    const boundary = await failWith((error) => [
      document.createElement("h2"),
      hydratableNode(() => document.createTextNode(error.message), () => null),
    ]);
    expect(boundary.childNodes.length).toBe(2);
    expect(boundary.firstChild.tagName).toBe("H2");
    expect(boundary.lastChild.data).toBe("boom");
    boundary.remove();
  });

  test("a string is the message inside the built-in fallback", async () => {
    const boundary = await failWith((error) => `caught: ${error.message}`);
    expect(boundary.querySelector("[data-afw-fallback]").textContent).toContain("caught: boom");
    boundary.remove();
  });

  test("nothing to render, or a throwing fallback, falls back to the built-in alert", async () => {
    for (const fallback of [() => null, () => [], () => false, () => { throw new Error("bad fallback"); }, undefined]) {
      const boundary = await failWith(fallback, "original");
      expect(boundary.querySelector("[data-afw-fallback]").textContent).toContain("original");
      boundary.remove();
    }
  });
});
