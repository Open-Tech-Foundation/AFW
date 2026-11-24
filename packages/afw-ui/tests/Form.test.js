// Field, the native choice controls, Accordion and Button.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { Buttons, Choices, Fields, Sections } from "./fixtures/FormDemo.jsx";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Field", () => {
  test("the label names the control; the description describes it", async () => {
    const view = render(Fields);
    await tick();
    const input = view.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("email");
    expect(input.getAttribute("name")).toBe("email");
    expect(input.required).toBe(true);
    const description = view.getByText("Receipts only.");
    expect(input.getAttribute("aria-describedby")).toBe(description.id);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(view.getByLabelText("Bio").tagName).toBe("TEXTAREA");
  });

  test("an error marks it invalid and joins the description; clearing it undoes both", async () => {
    const view = render(Fields);
    await tick();
    const input = view.getByLabelText("Email");
    view.getByTestId("fail").click();
    await tick();
    const error = view.getByText("Enter an email address");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby").split(" ")).toEqual([view.getByText("Receipts only.").id, error.id]);
    expect(input.closest(".afw-ui-field").hasAttribute("data-invalid")).toBe(true);
    view.getByTestId("fix").click();
    await tick();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(view.queryByText("Enter an email address")).toBe(null);
  });

  test("typing reports the value; a control outside a field has its own id", async () => {
    const view = render(Fields);
    await tick();
    type(view.getByLabelText("Email"), "a@b.c");
    await tick();
    expect(view.getByTestId("email").textContent).toBe("a@b.c");
    const own = view.getByLabelText("Standalone");
    expect(own.id).toMatch(/^afw-/);
    expect(own.id).not.toBe(view.getByLabelText("Email").id);
  });

  test("outside a field, a control keeps the consumer's id, description, invalid and required", async () => {
    const view = render(Fields);
    await tick();
    const input = view.getByLabelText("Own ARIA");
    expect(input.id).toBe("own-id");
    expect(input.getAttribute("aria-describedby")).toBe("own-hint");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.required).toBe(true);
  });
});

describe("choice controls", () => {
  test("checkbox, switch, radios and select report changes", async () => {
    const view = render(Choices);
    await tick();
    const state = () => view.getByTestId("state").textContent;
    expect(state()).toBe("false|true|team|in");
    view.getByLabelText("I accept the terms").click();
    view.getByLabelText("Email alerts").click();
    view.getByLabelText("Free").click();
    const select = view.getByLabelText("Country");
    select.value = "fr";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(state()).toBe("true|false|free|fr");
  });

  test("the switch is a switch; the select starts on its value; indeterminate is a property", async () => {
    const view = render(Choices);
    await tick();
    const sw = view.getByLabelText("Email alerts");
    expect(sw.hasAttribute("switch")).toBe(true);
    expect(sw.getAttribute("role")).toBe("switch"); // the fallback role (no native switch here)
    expect(sw.checked).toBe(true);
    // Visible state words for the theme, default English.
    expect([sw.dataset.on, sw.dataset.off]).toEqual(["On", "Off"]);
    expect(view.getByLabelText("Country").value).toBe("in");
    const mixed = view.getByLabelText("Select all");
    expect(mixed.indeterminate).toBe(true);
    mixed.click();
    await tick();
    expect(mixed.indeterminate).toBe(false);
  });

  test("switch state words are translatable", async () => {
    const view = render(Choices);
    await tick();
    const sw = view.getByLabelText("Benachrichtigungen");
    expect([sw.dataset.on, sw.dataset.off]).toEqual(["Ein", "Aus"]);
  });

  test("radios share one name in a fieldset named by its legend", async () => {
    const view = render(Choices);
    await tick();
    const [free, team] = [view.getByLabelText("Free"), view.getByLabelText("Team")];
    expect(free.name).toBe(team.name);
    expect(free.name).not.toBe("");
    expect(team.checked).toBe(true);
    const fieldset = free.closest("fieldset");
    expect(fieldset.querySelector("legend").textContent).toBe("Plan");
    expect(fieldset.getAttribute("aria-describedby")).toBe(view.getByText("Change it any time.").id);
  });
});

describe("Accordion", () => {
  test("single: items share a name (exclusive); multiple: no name", async () => {
    const view = render(Sections);
    await tick();
    const single = [...view.getByTestId("single").querySelectorAll("details")];
    const multi = [...view.getByTestId("multi").querySelectorAll("details")];
    expect(single[0].name).not.toBe("");
    expect(single[0].name).toBe(single[1].name);
    expect(multi.every((d) => !d.hasAttribute("name"))).toBe(true);
    expect(single[1].open).toBe(true);
    expect(single[0].querySelector("summary").textContent).toBe("Shipping");
  });
});

describe("Button", () => {
  test("a native button, type=button by default, with styling hooks and forwarded ARIA", async () => {
    const log = [];
    const view = render(Buttons, { log: (x) => log.push(x) });
    await tick();
    const plain = view.getByTestId("plain");
    expect(plain.tagName).toBe("BUTTON");
    expect(plain.getAttribute("type")).toBe("button");
    expect(plain.getAttribute("data-variant")).toBe("secondary");
    const primary = view.getByTestId("primary");
    expect(primary.getAttribute("type")).toBe("submit");
    expect([primary.dataset.variant, primary.dataset.size]).toEqual(["primary", "sm"]);
    expect(view.getByTestId("icon").getAttribute("aria-label")).toBe("Close");
    plain.click();
    expect(log).toEqual(["plain"]);
  });

  test("loading: busy, still focusable, and clicks are ignored", async () => {
    const log = [];
    const view = render(Buttons, { log: (x) => log.push(x) });
    await tick();
    view.getByTestId("toggle").click();
    await tick();
    const busy = view.getByTestId("busy");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.disabled).toBe(false);
    busy.click();
    expect(log).toEqual([]);
    view.getByTestId("toggle").click();
    await tick();
    busy.click();
    expect(log).toEqual(["busy"]);
  });

  test("VisuallyHidden text stays in the accessible content", async () => {
    const view = render(Buttons);
    await tick();
    expect(view.getByText("Close dialog").closest("button")).toBe(view.getByTestId("icon"));
  });
});
