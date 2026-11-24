// Layout primitives, the app shell (sidebar ↔ drawer), side navigation, breadcrumbs,
// the page header and pagination.

import { afterEach, describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { setRouteState } from "@opentf/afw";
import { Pages, Primitives, ResponsiveLayout, Shell } from "./fixtures/LayoutDemo.jsx";
import { at, breakpointLength, breakpoints, viewport } from "../internal/responsive.js";
import { pageRange } from "../components/Navigation.jsx";
import { isCurrentPath } from "../internal/navigate.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
afterEach(() => setRouteState({ pathname: "/" }));

describe("layout primitives", () => {
  test("hooks for the theme, and a card is an article", async () => {
    const view = render(Primitives);
    await tick();
    expect(view.getByTestId("stack").dataset.gap).toBe("lg");
    expect([view.getByTestId("inline").dataset.gap, view.getByTestId("inline").dataset.justify]).toEqual(["sm", "end"]);
    expect(view.getByTestId("grid").style.getPropertyValue("--afw-ui-grid-min")).toBe("12rem");
    expect(view.getByTestId("card").tagName).toBe("ARTICLE");
    expect(view.container.querySelector("hr.afw-ui-divider")).toBeTruthy();
  });
});

describe("responsive props", () => {
  test("a value per breakpoint becomes data-<prop>-<bp> hooks; a plain value is the base", async () => {
    const view = render(ResponsiveLayout);
    await tick();
    const stack = view.getByTestId("stack").dataset;
    expect([stack.direction, stack.directionMd, stack.gap, stack.gapLg, stack.align]).toEqual(["column", "row", "sm", "xl", "center"]);
    expect(stack.gapMd).toBe(undefined); // no entry, no hook: the smaller one carries on
    const inline = view.getByTestId("inline").dataset;
    expect([inline.justify, inline.justifyMd, inline.gap]).toEqual([undefined, "between", "sm"]);
  });

  test("Grid columns are counts per breakpoint, next to the auto-fill minimum", async () => {
    const view = render(ResponsiveLayout);
    await tick();
    const grid = view.getByTestId("grid");
    expect([grid.hasAttribute("data-columns"), grid.hasAttribute("data-columns-md"), grid.hasAttribute("data-columns-lg"), grid.hasAttribute("data-columns-xl")]).toEqual([true, true, false, true]);
    const v = (name) => grid.style.getPropertyValue(name).trim();
    expect([v("--afw-ui-grid-min"), v("--afw-ui-cols"), v("--afw-ui-cols-md"), v("--afw-ui-cols-xl")]).toEqual(["10rem", "1", "2", "4"]);
    const auto = view.getByTestId("auto");
    expect(auto.hasAttribute("data-columns")).toBe(false); // no columns: fit by min
  });

  test("Container caps the column by size", async () => {
    const view = render(ResponsiveLayout);
    await tick();
    const c = view.getByTestId("container");
    expect([c.className, c.dataset.size]).toEqual(["afw-ui-container", "md"]);
  });

  test("breakpoints, at() and lengths", () => {
    expect(breakpoints).toEqual({ sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" });
    expect([at("sm", "base"), at("sm", "md"), at({ md: "lg" }, "md"), at({ md: "lg" }, "base"), at(undefined, "base")]).toEqual(["sm", undefined, "lg", undefined, undefined]);
    expect([breakpointLength("lg"), breakpointLength("50rem")]).toEqual(["64rem", "50rem"]);
  });

  test("viewport compares the window to a breakpoint, and rejects unknown names", () => {
    expect(typeof viewport.atLeast("md")).toBe("boolean");
    expect(viewport.below("md")).toBe(!viewport.atLeast("md"));
    expect(() => viewport.atLeast("huge")).toThrow(/unknown breakpoint/);
  });
});

describe("AppShell", () => {
  test("landmarks, a skip link to main, and sidebar layout on a wide screen", async () => {
    const view = render(Shell, { drawerBelow: "1px" });
    await tick();
    const shell = view.container.querySelector(".afw-ui-shell");
    expect(shell.dataset.layout).toBe("sidebar");
    const skip = view.getByText("Skip to content");
    const main = view.container.querySelector("main");
    expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(view.container.querySelector("header.afw-ui-shell-header")).toBeTruthy();
    const sidebar = view.container.querySelector(".afw-ui-shell-sidebar");
    expect(sidebar.hasAttribute("popover")).toBe(false);
    expect(sidebar.hasAttribute("role")).toBe(false);
    expect(view.container.querySelector(".afw-ui-shell-menu-button").hidden).toBe(true);
    skip.click();
    expect(document.activeElement).toBe(main); // focus lands in the content, not just the scroll
  });

  test("narrow: the sidebar is a modal drawer opened by the menu button", async () => {
    const view = render(Shell, { drawerBelow: "100000px" });
    await tick();
    const shell = view.container.querySelector(".afw-ui-shell");
    const sidebar = view.container.querySelector(".afw-ui-shell-sidebar");
    const button = view.getByRole("button", { name: "Menu" });
    expect(shell.dataset.layout).toBe("drawer");
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-controls")).toBe(sidebar.id);
    expect(sidebar.getAttribute("popover")).toBe("manual");
    expect(sidebar.getAttribute("role")).toBe("dialog");
    expect(sidebar.getAttribute("aria-label")).toBe("Main navigation");

    button.focus();
    button.click();
    await tick();
    expect(sidebar.matches(":popover-open")).toBe(true);
    expect(sidebar.getAttribute("aria-modal")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(view.container.querySelector("main").inert).toBe(true);
    expect(view.container.querySelector("header").inert).toBe(true);
    expect(sidebar.contains(document.activeElement)).toBe(true); // focus moved into the drawer

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await tick();
    expect(sidebar.matches(":popover-open")).toBe(false);
    expect(view.container.querySelector("main").inert).toBe(false);
    expect(document.activeElement).toBe(button); // back to the trigger
  });

  test("narrow: a press outside or a chosen link closes the drawer", async () => {
    const view = render(Shell, { drawerBelow: "100000px" });
    await tick();
    const sidebar = view.container.querySelector(".afw-ui-shell-sidebar");
    const button = view.getByRole("button", { name: "Menu" });
    button.click();
    await tick();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await tick();
    expect(sidebar.matches(":popover-open")).toBe(false);
    button.click();
    await tick();
    const link = view.getByText("Overview");
    link.addEventListener("click", (e) => e.preventDefault(), { once: true });
    link.click();
    await tick();
    expect(sidebar.matches(":popover-open")).toBe(false);
  });
});

describe("SideNav", () => {
  test("the current page is aria-current, ancestors too unless exact, and its group opens", async () => {
    setRouteState({ pathname: "/projects/archived" });
    const view = render(Shell, { drawerBelow: "1px" });
    await tick(5);
    const current = (name) => view.getByText(name, { selector: ".afw-ui-sidenav-item" }).getAttribute("aria-current");
    expect(current("Archived")).toBe("page");
    expect(current("All projects")).toBe("page"); // an ancestor of the current path
    expect(current("Overview")).toBe(null); // exact: "/" is not an ancestor
    expect(view.container.querySelector("details.afw-ui-sidenav-group").open).toBe(true);
    expect(view.container.querySelector("nav.afw-ui-sidenav").getAttribute("aria-label")).toBe("Main");

    setRouteState({ pathname: "/" });
    await tick(5);
    expect(current("Overview")).toBe("page");
    expect(current("Archived")).toBe(null);
  });

  test("isCurrentPath: exact, ancestors, trailing slashes, query strings", () => {
    expect(isCurrentPath("/a/b", "/a")).toBe(true);
    expect(isCurrentPath("/a/b", "/a", true)).toBe(false);
    expect(isCurrentPath("/ab", "/a")).toBe(false);
    expect(isCurrentPath("/a/", "/a?x=1")).toBe(true);
    expect(isCurrentPath("/a", "/")).toBe(false);
    expect(isCurrentPath("/", "/")).toBe(true);
  });
});

describe("Breadcrumbs and PageHeader", () => {
  test("a labelled nav with an ordered list; the last link is the current page", async () => {
    const view = render(Shell, { drawerBelow: "1px" });
    await tick();
    const nav = view.getByRole("navigation", { name: "Breadcrumbs" });
    const links = [...nav.querySelectorAll("ol > li > a")];
    expect(links.map((a) => a.textContent)).toEqual(["Home", "Projects", "Archived"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);
    expect(nav.textContent).not.toContain("/"); // separators are CSS, not text
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Archived");
    expect(view.getByText("Projects you closed.")).toBeTruthy();
  });
});

describe("Pagination", () => {
  test("pageRange keeps the ends and the neighbors, with gaps", () => {
    expect(pageRange(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
    expect(pageRange(1, 12)).toEqual([1, 2, "…", 12]);
    expect(pageRange(3, 12)).toEqual([1, 2, 3, 4, "…", 12]); // a single hidden page is shown
    expect(pageRange(2, 3)).toEqual([1, 2, 3]);
    expect(pageRange(1, 0)).toEqual([]);
  });

  test("buttons: current page marked, ends disabled, clicks change the page", async () => {
    const view = render(Pages, { page: 1 });
    await tick();
    const nav = view.getByRole("navigation", { name: "Pagination" });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current.textContent).toBe("1");
    expect(current.getAttribute("aria-label")).toBe("Page 1");
    expect(nav.querySelector(".afw-ui-pagination-prev button").disabled).toBe(true);
    nav.querySelector(".afw-ui-pagination-next button").click();
    await tick();
    expect(view.getByTestId("page").textContent).toBe("2");
    view.getByRole("button", { name: "Page 12" }).click();
    await tick();
    expect(view.getByTestId("page").textContent).toBe("12");
    expect(nav.querySelector(".afw-ui-pagination-next button").disabled).toBe(true);
  });

  test("links: one URL per page; a disabled end has no href", async () => {
    const view = render(Pages);
    await tick();
    const nav = view.getByRole("navigation", { name: "Results pages" });
    expect([...nav.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))).toEqual(["/list?page=1", "/list?page=2", "/list?page=3", "/list?page=2"]);
    const prev = nav.querySelector(".afw-ui-pagination-prev a");
    expect(prev.hasAttribute("href")).toBe(false);
    expect(prev.getAttribute("aria-disabled")).toBe("true");
  });
});
