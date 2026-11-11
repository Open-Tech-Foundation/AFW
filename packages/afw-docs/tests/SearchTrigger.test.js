// The navbar search button: its accessible name is its visible text, so the label a
// user sees ("Search Ctrl K") is the name assistive tech uses (WCAG 2.5.3).
import { afterEach, expect, test } from "runtime:test";

import SearchTrigger from "../components/SearchTrigger.jsx";

const tick = () => new Promise((r) => setTimeout(r, 0));
let host;
afterEach(() => host?.remove());

test("the button is named by its visible text and announces the shortcut", async () => {
  host = document.createElement(SearchTrigger.tag);
  document.body.appendChild(host);
  await tick();
  const button = host.querySelector("button");
  expect(button.hasAttribute("aria-label")).toBe(false);
  expect(button.getAttribute("type")).toBe("button");
  expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K");
  expect(button.textContent.replace(/\s+/g, " ").trim()).toMatch(/^Search (Ctrl|⌘) K$/);
  expect(button.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
});

test("clicking it opens the search", async () => {
  let opened = 0;
  window.__afwOpenSearch = () => opened++;
  host = document.createElement(SearchTrigger.tag);
  document.body.appendChild(host);
  await tick();
  host.querySelector("button").click();
  expect(opened).toBe(1);
  delete window.__afwOpenSearch;
});
