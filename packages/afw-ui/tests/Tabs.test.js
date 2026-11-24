// <Tabs>: roles, selection state and id links rendered up front; one Tab stop on the
// selected tab; arrows, Home and End; automatic and manual activation.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Basic } from "./fixtures/TabsDemo.jsx";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

function setup(props = {}) {
  const view = render(Basic, props);
  const tabs = () => [...view.container.querySelectorAll("[data-afw-ui-tab]")];
  const panels = () => [...view.container.querySelectorAll('[role="tabpanel"]')];
  return { ...view, tabs, panels };
}

function expectSelected(view, index) {
  view.tabs().forEach((tab, i) => {
    expect(tab.getAttribute("aria-selected")).toBe(i === index ? "true" : "false");
    expect(tab.getAttribute("tabindex")).toBe(i === index ? "0" : "-1");
  });
  view.panels().forEach((panel, i) => expect(panel.getAttribute("hidden")).toBe(i === index ? null : "until-found"));
}

describe("Tabs", () => {
  test("roles, names and links; the default tab is selected", async () => {
    const view = setup();
    await tick();
    const list = view.container.querySelector(".afw-ui-tab-list");
    expect(list.getAttribute("role")).toBe("tablist"); // fallback sets what focusgroup infers
    expect(list.getAttribute("aria-label")).toBe("Project");
    expect(view.tabs().every((t) => t.getAttribute("role") === "tab")).toBe(true);
    view.tabs().forEach((tab, i) => {
      const panel = view.panels()[i];
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(tab.hasAttribute("aria-controls")).toBe(false); // no screen reader uses it
    });
    expectSelected(view, 1);
    expect(view.tabs()[1].hasAttribute("focusgroupstart")).toBe(true);
  });

  test("arrows move and select (automatic), skipping disabled and wrapping", async () => {
    const changes = [];
    const view = setup({ onChange: (v) => changes.push(v) });
    await tick();
    view.tabs()[1].focus();
    key(view.tabs()[1], "ArrowRight");
    await tick();
    expect(document.activeElement).toBe(view.tabs()[3]); // "c" is disabled
    expectSelected(view, 3);
    key(view.tabs()[3], "ArrowRight");
    await tick();
    expectSelected(view, 0); // wraps
    key(view.tabs()[0], "End");
    await tick();
    expectSelected(view, 3);
    key(view.tabs()[3], "Home");
    await tick();
    expectSelected(view, 0);
    expect(changes).toEqual(["d", "a", "d", "a"]);
  });

  test("manual activation: arrows move focus only; Enter selects", async () => {
    const view = setup({ activation: "manual" });
    await tick();
    view.tabs()[1].focus();
    key(view.tabs()[1], "ArrowLeft");
    await tick();
    expect(document.activeElement).toBe(view.tabs()[0]);
    expectSelected(view, 1);
    key(view.tabs()[0], "Enter");
    await tick();
    expectSelected(view, 0);
  });

  test("clicking a disabled tab does nothing; find-in-page selects a hidden panel's tab", async () => {
    const view = setup();
    await tick();
    view.tabs()[2].click();
    await tick();
    expectSelected(view, 1);
    view.panels()[3].dispatchEvent(new Event("beforematch"));
    await tick();
    expectSelected(view, 3);
  });
});
