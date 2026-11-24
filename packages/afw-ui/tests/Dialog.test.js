// <Dialog>: a native modal <dialog>, opened by an invoker trigger, named by its title,
// described by its description when there is one, and synced to controlled state.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Basic, ConsumerAttrs, Controlled, NoDescription } from "./fixtures/DialogDemo.jsx";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Dialog", () => {
  test("the trigger is an invoker for the dialog, and the dialog is named by its title", async () => {
    const view = render(Basic);
    await tick();
    const trigger = view.getByTestId("trigger");
    const dialog = view.getByTestId("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("commandfor")).toBe(dialog.id);
    expect(trigger.getAttribute("command")).toBe("show-modal");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    const title = view.getByText("Delete this project?");
    expect(title.tagName).toBe("H2");
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(view.getByText("Its pages are removed.").id);
    // Never the ARIA a native modal already provides.
    expect(dialog.hasAttribute("role")).toBe(false);
    expect(dialog.hasAttribute("aria-modal")).toBe(false);
  });

  test("ids are unique per instance", async () => {
    const a = render(Basic);
    const b = render(Basic);
    await tick();
    expect(a.getByTestId("dialog").id).not.toBe(b.getByTestId("dialog").id);
  });

  test("the trigger opens it as a modal, and a close button closes it with its value", async () => {
    const view = render(Basic);
    await tick();
    const dialog = view.getByTestId("dialog");
    view.getByTestId("trigger").click();
    expect(dialog.open).toBe(true);
    expect(dialog.matches(":modal")).toBe(true);
    view.getByText("Delete", { selector: "dialog button" }).click();
    expect(dialog.open).toBe(false);
  });

  test("a dialog without a description is not described, and keeps author ARIA", async () => {
    const view = render(NoDescription);
    await tick();
    const dialog = view.getByTestId("dialog");
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.getAttribute("closedby")).toBe("none");
  });

  test("closedby=none keeps it open on Esc (cancel is prevented)", async () => {
    const view = render(NoDescription);
    await tick();
    const dialog = view.getByTestId("dialog");
    dialog.showModal();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  test("controlled: state opens it, and closing reports the return value", async () => {
    const log = [];
    const view = render(Controlled, { log: (open, value) => log.push([open, value]) });
    await tick();
    const dialog = view.getByTestId("dialog");
    view.getByTestId("external").click();
    await tick();
    expect(dialog.open).toBe(true);
    expect(view.getByTestId("state").textContent).toBe("open");
    view.getByText("OK").click();
    await tick();
    expect(dialog.open).toBe(false);
    expect(view.getByTestId("state").textContent).toBe("closed");
    expect(log.at(-1)).toEqual([false, "ok"]);
    expect(dialog.returnValue).toBe(""); // reset, so a later Esc cannot report "ok"
  });

  test("consumer attributes merge classes but cannot break the trigger→dialog wiring", async () => {
    const view = render(ConsumerAttrs);
    await tick();
    const dialog = view.getByTestId("dialog");
    const trigger = view.getByText("Open");
    expect(trigger.getAttribute("commandfor")).toBe(dialog.id);
    expect(dialog.id).not.toBe("my-dialog");
    expect(trigger.className).toBe("afw-ui-dialog-trigger mine");
    expect(dialog.className).toBe("afw-ui-dialog wide");
    trigger.click();
    expect(dialog.open).toBe(true);
  });
});
