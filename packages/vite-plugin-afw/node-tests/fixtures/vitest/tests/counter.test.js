// The shared test API: Vitest here, runtime:test under esdev.
import { expect, test } from "@opentf/afw-test/test";
import { render, userEvent } from "@opentf/afw-test";
import Counter from "../app/Counter.jsx";

test("increments on click and derives a value", async () => {
  const { getByRole, getByText } = render(Counter, { start: 2 });
  const button = getByRole("button", { name: "Count: 2" });
  await userEvent.setup().click(button);
  expect(button.textContent).toBe("Count: 3");
  expect(getByText("Doubled: 6")).toBeTruthy();
});

test("each test starts from a clean document", () => {
  expect(document.body.children.length).toBe(0);
});
