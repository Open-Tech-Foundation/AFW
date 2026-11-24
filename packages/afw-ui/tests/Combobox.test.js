// <Combobox>: WAI-ARIA list autocomplete — the input keeps focus, aria-activedescendant
// names the highlighted option, typing filters, arrows/Enter/Esc, the hidden form value,
// and reverting free text.

import { afterEach, describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Basic, Uncontrolled } from "./fixtures/ComboboxDemo.jsx";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));

function setup(props = {}) {
  const view = render(Basic, props);
  const input = () => view.getByRole("combobox");
  const popup = () => view.container.querySelector(".afw-ui-combobox-popup");
  const options = () => [...view.container.querySelectorAll('[role="option"]')];
  const labels = () => options().map((o) => o.textContent);
  const type = async (text) => {
    input().focus();
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
  };
  const activeLabel = () => document.getElementById(input().getAttribute("aria-activedescendant") ?? "")?.textContent ?? null;
  return { ...view, input, popup, options, labels, type, activeLabel };
}

describe("Combobox", () => {
  test("a combobox named by its field, controlling a listbox named the same way", async () => {
    const v = setup();
    await tick();
    const input = v.input();
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("autocomplete")).toBe("off");
    const list = v.container.querySelector('[role="listbox"]');
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    // The label names the input (for=) and the listbox (aria-labelledby).
    expect(v.getAllByLabelText("Fruit")).toEqual([input, list]);
    expect(list.getAttribute("aria-labelledby")).toBe(v.getByText("Fruit", { selector: "label" }).id);
    expect(input.getAttribute("aria-describedby")).toBe(v.getByText("Pick one.").id);
    expect(v.popup().getAttribute("popover")).toBe("manual");
  });

  test("typing opens and filters; the count is announced", async () => {
    const v = setup();
    await tick();
    await v.type("ap");
    expect(v.input().getAttribute("aria-expanded")).toBe("true");
    expect(v.popup().matches(":popover-open")).toBe(true);
    expect(v.labels()).toEqual(["Apple", "Apricot", "Grape"]);
    expect(v.input().hasAttribute("aria-activedescendant")).toBe(false); // nothing chosen for you
    await tick(550);
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.querySelector('[data-afw-ui-announcer="normal"]').textContent).toBe("3 results");
    await v.type("zz");
    expect(v.labels()).toEqual([]);
    expect(v.getByText("No results")).toBeTruthy();
  });

  test("arrows move the highlight (skipping disabled, wrapping); Enter chooses", async () => {
    const log = [];
    const v = setup({ log: (x) => log.push(x) });
    await tick();
    v.input().focus();
    key(v.input(), "ArrowDown");
    await tick();
    expect(v.input().getAttribute("aria-expanded")).toBe("true");
    expect(v.activeLabel()).toBe("Apple");
    key(v.input(), "ArrowDown");
    key(v.input(), "ArrowDown");
    key(v.input(), "ArrowDown");
    await tick();
    expect(v.activeLabel()).toBe("Grape"); // Cherry is disabled
    key(v.input(), "ArrowUp");
    await tick();
    expect(v.activeLabel()).toBe("Banana");
    key(v.input(), "Enter");
    await tick();
    expect(log).toEqual(["Banana"]);
    expect(v.input().value).toBe("Banana");
    expect(v.input().getAttribute("aria-expanded")).toBe("false");
    expect(v.options().find((o) => o.textContent === "Banana").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(v.input()); // focus never left the input
  });

  test("Esc closes the list, then clears the text", async () => {
    const log = [];
    const v = setup({ initial: "Mango", log: (x) => log.push(x) });
    await tick();
    expect(v.input().value).toBe("Mango");
    v.input().focus();
    key(v.input(), "ArrowDown");
    await tick();
    key(v.input(), "Escape");
    await tick();
    expect(v.input().getAttribute("aria-expanded")).toBe("false");
    expect(v.input().value).toBe("Mango");
    key(v.input(), "Escape");
    await tick();
    expect(v.input().value).toBe("");
    expect(log).toEqual([undefined]);
  });

  test("a click chooses without the input losing focus", async () => {
    const v = setup();
    await tick();
    await v.type("man");
    const mango = v.options()[0];
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    mango.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // keeps focus in the input
    mango.click();
    await tick();
    expect(v.getByTestId("value").textContent).toBe("Mango");
    expect(v.input().value).toBe("Mango");
  });

  test("leaving with unmatched text puts back the chosen label; custom values are kept", async () => {
    const v = setup({ initial: "Apple" });
    await tick();
    await v.type("Appl");
    v.input().dispatchEvent(new FocusEvent("blur"));
    await tick();
    expect(v.input().value).toBe("Apple");

    const log = [];
    const c = setup({ custom: true, log: (x) => log.push(x) });
    await tick();
    await c.type("Durian");
    c.input().dispatchEvent(new FocusEvent("blur"));
    await tick();
    expect(log).toEqual(["Durian"]);
  });

  test("the form submits the option's value; an outside change updates the text", async () => {
    const v = setup({ initial: "cherry" });
    await tick();
    expect(v.input().value).toBe("Cherry");
    expect(new FormData(v.getByTestId("form")).get("fruit")).toBe("cherry");
    v.getByTestId("pick-mango").click();
    await tick();
    expect(v.input().value).toBe("Mango");
  });

  test("uncontrolled: starts from defaultValue and keeps what is chosen", async () => {
    const view = render(Uncontrolled);
    await tick();
    const input = view.getByRole("combobox");
    expect(input.value).toBe("Grape");
    expect(view.container.querySelector('[role="listbox"]').getAttribute("aria-label")).toBe("Fruit");
    input.focus();
    key(input, "ArrowDown");
    await tick();
    key(input, "Enter");
    await tick();
    expect(input.value).toBe("Apple");
    expect(new FormData(view.getByTestId("form")).get("fruit")).toBe("Apple");
  });
});
