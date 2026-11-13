import { expect, test } from "@opentf/afw-test/test";
import { render } from "@opentf/afw-test";
import Home from "../../app/page.tsx";

test("the home page links to the docs", () => {
  const { getByRole } = render(Home);
  expect(getByRole("heading", { level: 1 }).textContent).toBe("{{name}}");
  expect(getByRole("link", { name: "Read the docs" }).getAttribute("href")).toBe("/docs");
});
