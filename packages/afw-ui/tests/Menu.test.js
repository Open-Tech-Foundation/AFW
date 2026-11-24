// <Menu>: the menu-button pattern on an `auto` popover and a `menu` focus group —
// keyboard vs pointer opens, arrows, activation, checkable items, focus restoration.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Basic } from "./fixtures/MenuDemo.jsx";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

function setup(props = {}) {
  const view = render(Basic, props);
  const trigger = view.getByTestId("trigger");
  const menu = () => view.container.querySelector(".afw-ui-menu");
  const list = () => view.container.querySelector(".afw-ui-menu-list");
  const item = (name) => view.getByText(name, { selector: ".afw-ui-menu-item" });
  const isOpen = () => menu().matches(":popover-open");
  return { ...view, trigger, menu, list, item, isOpen };
}

describe("Menu", () => {
  test("trigger and menu markup: invoker, haspopup, expanded, named by the trigger", async () => {
    const v = setup();
    await tick();
    expect(v.trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(v.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(v.trigger.getAttribute("command")).toBe("toggle-popover");
    expect(v.trigger.getAttribute("commandfor")).toBe(v.menu().id);
    expect(v.menu().getAttribute("popover")).toBe("auto");
    expect(v.list().getAttribute("aria-labelledby")).toBe(v.trigger.id);
    expect(v.list().getAttribute("focusgroup")).toBe("menu nomemory");
    // The popover follows its trigger in the DOM (no implicit aria-details).
    expect(v.trigger.hasAttribute("aria-details")).toBe(false);
  });

  test("a keyboard open enters the menu; the fallback sets the menu roles", async () => {
    const v = setup();
    await tick();
    v.trigger.focus();
    v.trigger.click(); // Enter/Space: a click with detail 0
    await tick();
    expect(v.isOpen()).toBe(true);
    expect(v.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(v.item("Rename"));
    expect(v.list().getAttribute("role")).toBe("menu");
    expect(v.item("Rename").getAttribute("role")).toBe("menuitem");
    expect(v.item("Show grid").getAttribute("role")).toBe("menuitemcheckbox"); // its own role kept
  });

  test("a pointer open keeps focus on the trigger", async () => {
    const v = setup();
    await tick();
    v.trigger.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    v.trigger.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true }));
    await tick();
    expect(v.isOpen()).toBe(true);
    expect(document.activeElement).toBe(v.trigger);
  });

  test("ArrowDown/ArrowUp on the trigger open onto the first/last item; arrows skip disabled", async () => {
    const v = setup();
    await tick();
    v.trigger.focus();
    key(v.trigger, "ArrowUp");
    await tick();
    expect(document.activeElement).toBe(v.item("Date"));
    key(document.activeElement, "Home");
    expect(document.activeElement).toBe(v.item("Rename"));
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement).toBe(v.item("Settings")); // "Archive" is disabled
    key(document.activeElement, "End");
    expect(document.activeElement).toBe(v.item("Date"));
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement).toBe(v.item("Rename")); // wraps
  });

  test("choosing a command runs it, closes, and returns focus to the trigger", async () => {
    const log = [];
    const v = setup({ log: (x) => log.push(x) });
    await tick();
    v.trigger.focus();
    v.trigger.click();
    await tick();
    v.item("Rename").click();
    await tick();
    expect(log).toEqual(["rename"]);
    expect(v.isOpen()).toBe(false);
    expect(document.activeElement).toBe(v.trigger);
    expect(v.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("a disabled item does nothing", async () => {
    const log = [];
    const v = setup({ log: (x) => log.push(x) });
    await tick();
    v.trigger.click();
    await tick();
    v.item("Archive").click();
    await tick();
    expect(log).toEqual([]);
    expect(v.isOpen()).toBe(true);
  });

  test("checkbox: Space toggles and stays open, Enter toggles and closes", async () => {
    const v = setup();
    await tick();
    v.trigger.focus();
    v.trigger.click();
    await tick();
    const grid = v.item("Show grid");
    grid.focus();
    key(grid, " ");
    grid.click();
    await tick();
    expect(grid.getAttribute("aria-checked")).toBe("true");
    expect(v.getByTestId("grid").textContent).toBe("on");
    expect(v.isOpen()).toBe(true);
    key(grid, "Enter");
    grid.click();
    await tick();
    expect(grid.getAttribute("aria-checked")).toBe("false");
    expect(v.isOpen()).toBe(false);
  });

  test("radio items: one checked in a named group; choosing closes", async () => {
    const v = setup();
    await tick();
    v.trigger.click();
    await tick();
    const group = v.container.querySelector('[role="group"]');
    expect(group.getAttribute("aria-label")).toBe("Sort by");
    expect(v.item("Name").getAttribute("aria-checked")).toBe("true");
    v.item("Date").click();
    await tick();
    expect(v.getByTestId("sort").textContent).toBe("date");
    expect(v.item("Date").getAttribute("aria-checked")).toBe("true");
    expect(v.item("Name").getAttribute("aria-checked")).toBe("false");
    expect(v.isOpen()).toBe(false);
  });

  test("focus leaving the menu closes it; closing with focus inside returns it to the trigger", async () => {
    const v = setup();
    await tick();
    v.trigger.focus();
    v.trigger.click();
    await tick();
    v.getByTestId("after").focus(); // Tab out
    await tick();
    expect(v.isOpen()).toBe(false);

    v.trigger.focus();
    v.trigger.click();
    await tick();
    expect(document.activeElement).toBe(v.item("Rename"));
    v.menu().hidePopover(); // Esc / light dismiss
    await tick();
    expect(document.activeElement).toBe(v.trigger);
  });
});
