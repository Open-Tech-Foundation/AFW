// <Toaster> + toast(): one named manual-popover region, announced text, persistent by
// default, timed toasts that pause on interaction, focus handling on close, and toasts
// held back while a modal dialog is open.

import { afterEach, describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Page } from "./fixtures/ToastDemo.jsx";
import { clearToasts, dismissToast, toast } from "../components/Toast.jsx";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
// Poll for a condition the page reaches after queued tasks (the dialog's `close` event,
// then the flush timer), however long a loaded machine takes to run them.
async function until(check, ms = 2000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await tick(5);
  return check();
}

afterEach(() => clearToasts());

function setup() {
  const view = render(Page);
  const region = () => view.container.querySelector(".afw-ui-toaster");
  const items = () => [...view.container.querySelectorAll(".afw-ui-toast")];
  return { ...view, region, items };
}

describe("Toast", () => {
  test("a named region, shown only while it has toasts", async () => {
    const v = setup();
    await tick();
    expect(v.region().getAttribute("role")).toBe("region");
    expect(v.region().getAttribute("aria-label")).toBe("Notifications");
    expect(v.region().getAttribute("popover")).toBe("manual");
    expect(v.region().matches(":popover-open")).toBe(false);
    const id = toast("Project saved", { tone: "success" });
    await tick();
    expect(v.region().matches(":popover-open")).toBe(true);
    expect(v.items().map((t) => t.textContent)).toEqual(["Project saved×"]);
    expect(v.items()[0].dataset.tone).toBe("success");
    dismissToast(id);
    await tick();
    expect(v.items().length).toBe(0);
    expect(v.region().matches(":popover-open")).toBe(false);
  });

  test("announces the text (title and message), not the controls", async () => {
    setup();
    await tick();
    toast("Upload failed", { title: "Report.pdf", tone: "danger" });
    await tick();
    await frame();
    const live = document.querySelector('[data-afw-ui-announcer="high"]');
    expect(live.getAttribute("aria-live")).toBe("assertive");
    expect(live.textContent).toBe("Report.pdf. Upload failed");
  });

  test("persistent by default; a duration dismisses, paused while focus is inside", async () => {
    const v = setup();
    await tick();
    toast("Stays");
    toast("Goes", { duration: 20 });
    await tick(40);
    expect(v.items().map((t) => t.querySelector(".afw-ui-toast-message").textContent)).toEqual(["Stays"]);

    toast("Paused", { duration: 20 });
    await tick();
    v.items()[1].querySelector("button").focus();
    await tick(40);
    expect(v.items().length).toBe(2); // focus inside pauses the timer
  });

  test("closing the focused toast moves focus to the next, then back to where it came from", async () => {
    const v = setup();
    await tick();
    toast("One");
    toast("Two");
    await tick();
    v.getByTestId("origin").focus();
    const first = v.items()[0].querySelector("button");
    first.focus();
    first.click();
    await tick();
    expect(v.items().length).toBe(1);
    expect(document.activeElement).toBe(v.items()[0].querySelector("button"));
    document.activeElement.click();
    await tick();
    expect(v.items().length).toBe(0);
    expect(document.activeElement).toBe(v.getByTestId("origin"));
  });

  test("while a modal dialog is open, toasts wait until it closes", async () => {
    const v = setup();
    await tick();
    const modal = v.getByTestId("modal");
    modal.showModal();
    toast("Later");
    await tick();
    expect(v.items().length).toBe(0);
    modal.close();
    expect(await until(() => v.items().length === 1)).toBe(true);
  });
});
