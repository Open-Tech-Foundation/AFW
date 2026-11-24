// <Popover>: an `auto` popover opened by an invoker trigger whose `aria-expanded` follows
// the popover's own state, tethered to the trigger.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { PopoverBasic } from "./fixtures/OverlayDemo.jsx";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Popover", () => {
  test("the trigger toggles an auto popover and reports aria-expanded from its state", async () => {
    const view = render(PopoverBasic);
    await tick();
    const trigger = view.getByTestId("trigger");
    const panel = view.getByTestId("panel");
    expect(panel.getAttribute("popover")).toBe("auto");
    expect(trigger.getAttribute("commandfor")).toBe(panel.id);
    expect(trigger.getAttribute("command")).toBe("toggle-popover");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();
    await tick();
    expect(panel.matches(":popover-open")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Closed by anything else (script, Esc, light dismiss): the trigger follows.
    panel.hidePopover();
    await tick();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("a close button hides it, and the panel keeps its author ARIA", async () => {
    const view = render(PopoverBasic);
    await tick();
    const panel = view.getByTestId("panel");
    view.getByTestId("trigger").click();
    await tick();
    view.getByText("Done").click();
    await tick();
    expect(panel.matches(":popover-open")).toBe(false);
    expect(panel.getAttribute("aria-label")).toBe("Filters");
    expect(panel.getAttribute("data-placement")).toBe("bottom-end");
  });
});
