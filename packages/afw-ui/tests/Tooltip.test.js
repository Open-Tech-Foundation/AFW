// <Tooltip>: a `hint` popover whose ARIA depends on how its text relates to the trigger's
// name, opened on hover/focus by our fallback where interest invokers are missing.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Tooltips } from "./fixtures/OverlayDemo.jsx";
import { accessibleName } from "../components/Tooltip.jsx";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const tipOf = (view, trigger) => view.container.querySelector(`[popover="hint"]#${CSS.escape(
  trigger.closest(".afw-ui-tooltip-anchor").querySelector('[popover="hint"]').id,
)}`);

describe("Tooltip", () => {
  test("renders a hint popover with a unique id", async () => {
    const view = render(Tooltips);
    await tick();
    const tips = [...view.container.querySelectorAll('[popover="hint"]')];
    expect(tips.length).toBe(4);
    expect(new Set(tips.map((t) => t.id)).size).toBe(4);
  });

  test("a hint that repeats the trigger's name adds nothing", async () => {
    const view = render(Tooltips);
    await tick();
    const trigger = view.getByTestId("same");
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    expect(trigger.hasAttribute("aria-labelledby")).toBe(false);
    expect(tipOf(view, trigger).hasAttribute("role")).toBe(false);
  });

  test("a trigger with no name is labelled by the hint", async () => {
    const view = render(Tooltips);
    await tick();
    const trigger = view.getByTestId("unnamed");
    const tip = tipOf(view, trigger);
    expect(trigger.getAttribute("aria-labelledby")).toBe(tip.id);
    expect(tip.getAttribute("role")).toBe("tooltip");
  });

  test("otherwise the hint describes the trigger, and author ARIA wins", async () => {
    const view = render(Tooltips);
    await tick();
    const link = view.getByTestId("described");
    expect(link.getAttribute("aria-describedby")).toBe(tipOf(view, link).id);
    expect(view.getByTestId("author").getAttribute("aria-describedby")).toBe("mine");
  });

  test("fallback: hover opens after the delay, leaving closes, Esc dismisses", async () => {
    const view = render(Tooltips);
    await tick();
    const link = view.getByTestId("described");
    const tip = tipOf(view, link);
    link.dispatchEvent(new PointerEvent("pointerenter"));
    await tick(5);
    expect(tip.matches(":popover-open")).toBe(true);
    link.dispatchEvent(new PointerEvent("pointerleave"));
    await tick(150);
    expect(tip.matches(":popover-open")).toBe(false);

    link.dispatchEvent(new PointerEvent("pointerenter"));
    await tick(5);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(tip.matches(":popover-open")).toBe(false);
  });

  test("the pointer can move onto the hint without it closing (WCAG 1.4.13)", async () => {
    const view = render(Tooltips);
    await tick();
    const link = view.getByTestId("described");
    const tip = tipOf(view, link);
    link.dispatchEvent(new PointerEvent("pointerenter"));
    await tick(5);
    link.dispatchEvent(new PointerEvent("pointerleave"));
    tip.dispatchEvent(new PointerEvent("pointerenter"));
    await tick(150);
    expect(tip.matches(":popover-open")).toBe(true);
  });

  test("accessibleName follows labelledby, label, text and alt", () => {
    const host = document.createElement("div");
    host.innerHTML = '<span id="l1">Save</span><button aria-labelledby="l1">x</button>' +
      '<button aria-label=" Close  dialog ">x</button><button><img alt="Print"></button><button title="T"></button>';
    document.body.append(host);
    const [a, b, c, d] = host.querySelectorAll("button");
    expect([accessibleName(a), accessibleName(b), accessibleName(c), accessibleName(d)]).toEqual(["Save", "Close dialog", "Print", "T"]);
    host.remove();
  });
});
