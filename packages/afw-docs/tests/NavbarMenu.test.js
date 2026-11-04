// The navbar menu for pages without a sidebar: the button opens the top-level links,
// and navigation or Escape closes them. (Which screens show it is CSS, covered by the
// browser e2e.)
import { afterEach, beforeEach, expect, test } from "runtime:test";
import { setRouteState } from "@opentf/afw";

import NavbarMenu from "../components/NavbarMenu.jsx";

const LINKS = [{ label: "Home", href: "/" }, { label: "Docs", href: "/docs" }, { label: "API", href: "/api" }];
const tick = () => new Promise((r) => setTimeout(r, 0));
let host;

beforeEach(() => {
  setRouteState({ pathname: "/" });
  host = document.createElement(NavbarMenu.tag);
  host.links = LINKS;
  document.body.appendChild(host);
});
afterEach(() => host.remove());

const button = () => host.querySelector(".afwd-navbar-menu-toggle");
const menu = () => host.querySelector("#afw-navbar-menu");

test("the button opens the links and says so", async () => {
  expect(menu()).toBe(null);
  expect(button().getAttribute("aria-expanded")).toBe("false");
  button().click();
  await tick();
  expect([...menu().querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Home", "Docs", "API"]);
  expect(button().getAttribute("aria-expanded")).toBe("true");
  button().click();
  await tick();
  expect(menu()).toBe(null);
});

test("a navigation closes it", async () => {
  button().click();
  await tick();
  setRouteState({ pathname: "/docs" });
  await tick();
  expect(menu()).toBe(null);
});

test("Escape closes it", async () => {
  button().click();
  await tick();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await tick();
  expect(menu()).toBe(null);
});
