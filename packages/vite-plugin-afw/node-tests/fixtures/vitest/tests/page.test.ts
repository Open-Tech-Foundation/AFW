import { expect, test } from "vitest";
import { render, userEvent } from "@opentf/afw-test";
import Greet from "../app/greet/page.tsx";

test("a TypeScript page mounts, runs onMount and reacts to typing", async () => {
  const { getByRole, getByText } = render(Greet);
  expect(getByText("mounted")).toBeTruthy();
  await userEvent.setup().type(getByRole("textbox", { name: "Name" }), "Ada");
  expect(getByText("Hello, Ada!")).toBeTruthy();
});
