import { expect, test } from "@opentf/afw-test/test";
import { render, userEvent } from "@opentf/afw-test";
import { Counter } from "../../index.js";

test("counts clicks", async () => {
  const { getByRole, getByText } = render(Counter, { start: 1 });
  await userEvent.setup().click(getByRole("button", { name: "Count: 1" }));
  expect(getByRole("button").textContent).toBe("Count: 2");
  expect(getByText(/Doubled: 4/)).toBeTruthy();
});
