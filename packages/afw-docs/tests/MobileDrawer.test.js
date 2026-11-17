// Mobile sidebar drawer — the DOM contract shared by <Sidebar> (the drawer) and
// <SidebarToggle> (the navbar burger). The unit DOM evaluates no CSS, so the *visual*
// off-canvas/responsive behavior is covered by the browser e2e
// (tests/e2e/mobile-drawer.mjs); here we assert the JS-observable wiring: open/close
// state, the `is-open` classes, the drawer's modality (dialog role, `aria-modal`, the
// rest of the page `inert`, focus in and back out), the root flags, the
// cross-component event bridge, and teardown.
//
// esdev.test.json compiles imports with the afwc plugin, so we mount
// them the way the runtime does — by their registered custom-element tag —
// rather than through a JSX harness (which would itself be compiled into a
// component).

import { afterEach, beforeEach, describe, expect, test } from "runtime:test";
import { router, setRouteState } from "@opentf/afw";

// Component sources, compiled on import by the test config's afwc plugin.
import Sidebar from "../components/Sidebar.jsx";
import SidebarToggle from "../components/SidebarToggle.jsx";

const NAV = [
  { title: "Introduction", path: "/docs" },
  { title: "Guide", items: [{ title: "Routing", path: "/docs/routing" }] },
];
const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
];

const tick = () => new Promise((r) => setTimeout(r, 0));
// Focus moves into the drawer once it renders (two animation frames after opening).
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const root = () => document.documentElement;
const aside = () => document.querySelector("#afw-sidebar");
const backdrop = () => document.querySelector(".afwd-sidebar-backdrop");
const burger = () => document.querySelector(".afwd-navbar-burger");

// Mount the burger + drawer as siblings, exactly how DocsLayout composes them (the
// burger in the navbar, the drawer in the content grid).
const mounted = new Set();
function mount(nav = NAV) {
  const container = document.createElement("div");
  const toggle = document.createElement(SidebarToggle.tag);
  const drawer = document.createElement(Sidebar.tag);
  drawer.nav = nav; // object props → set before connect so they're read at mount
  drawer.config = { nav: NAV_LINKS };
  container.append(toggle, drawer);
  document.body.appendChild(container);
  mounted.add(container);
  return { container, unmount: () => (container.remove(), mounted.delete(container)) };
}

// A phone-sized viewport: below the 768px breakpoint the sidebar is a drawer.
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  setRouteState({ pathname: "/docs" });
  window.matchMedia = (query) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  // Remove any still-mounted trees so each test sees exactly one drawer/burger (the
  // globals and the root flags are per-mount; disconnect runs their cleanup).
  for (const c of mounted) c.remove();
  mounted.clear();
  root().removeAttribute("data-afw-has-sidebar");
  root().removeAttribute("data-afw-sidebar-open");
  document.body.style.removeProperty("overflow");
  delete window.__afwToggleSidebar;
  delete window.__afwCloseSidebar;
});

describe("mobile sidebar drawer", () => {
  test("mounts the drawer closed and registers the toggle controls", async () => {
    mount();
    await tick();

    expect(aside()).not.toBeNull();
    expect(backdrop()).not.toBeNull();
    expect(burger()).not.toBeNull();

    // The burger shows only where a sidebar is mounted — flagged on the root.
    expect(root().hasAttribute("data-afw-has-sidebar")).toBe(true);
    expect(typeof window.__afwToggleSidebar).toBe("function");

    // Closed initial state.
    expect(aside().classList.contains("is-open")).toBe(false);
    expect(backdrop().classList.contains("is-open")).toBe(false);
    expect(burger().getAttribute("aria-expanded")).toBe("false");
    expect(burger().getAttribute("aria-controls")).toBe("afw-sidebar");
  });

  test("the drawer renders its nav tree from the `nav` prop", async () => {
    mount();
    await tick();

    // `Guide` is a group with children → renders one collapse toggle. Top-level groups
    // start expanded, so its sublist (with `Routing`) is visible alongside the
    // `Introduction` leaf link.
    const toggles = aside().querySelectorAll(".afwd-sidebar-group-toggle");
    expect(toggles.length).toBe(1);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("true");

    const sublist = aside().querySelector(".afwd-sidebar-sublist");
    expect(sublist).not.toBeNull();
    expect(sublist.getAttribute("id")).toBe(toggles[0].getAttribute("aria-controls"));

    const labels = Array.from(aside().querySelectorAll(".afwd-sidebar-link"), (a) => a.textContent.trim());
    expect(labels).toContain("Introduction");
    expect(labels).toContain("Routing");
  });

  test("nested groups collapse by default and toggle open on click", async () => {
    // `Sub` is a nested (depth > 0) group that does not hold the active route (/docs),
    // so it starts collapsed; clicking its toggle reveals the child.
    const NESTED = [
      {
        title: "Guide",
        items: [{ title: "Sub", items: [{ title: "Deep", path: "/docs/deep" }] }],
      },
    ];
    mount(NESTED);
    await tick();

    const subToggle = Array.from(aside().querySelectorAll(".afwd-sidebar-group-toggle")).find(
      (b) => b.textContent.trim() === "Sub",
    );
    expect(subToggle).not.toBeUndefined();
    expect(subToggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(subToggle.getAttribute("aria-controls"))).toBeNull();

    subToggle.click();
    await tick();

    expect(subToggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(subToggle.getAttribute("aria-controls"));
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Deep");
  });

  test("the branch holding the active route auto-expands", async () => {
    setRouteState({ pathname: "/docs/deep" });
    const NESTED = [
      {
        title: "Guide",
        items: [{ title: "Sub", items: [{ title: "Deep", path: "/docs/deep" }] }],
      },
    ];
    mount(NESTED);
    await tick();

    const subToggle = Array.from(aside().querySelectorAll(".afwd-sidebar-group-toggle")).find(
      (b) => b.textContent.trim() === "Sub",
    );
    expect(subToggle.getAttribute("aria-expanded")).toBe("true");
    const labels = Array.from(aside().querySelectorAll(".afwd-sidebar-link"), (a) => a.textContent.trim());
    expect(labels).toContain("Deep");
  });

  test("the drawer surfaces the top-level site links from `config.nav`", async () => {
    mount();
    await tick();

    const drawerLinks = aside().querySelector(".afwd-drawer-links");
    expect(drawerLinks).not.toBeNull();
    const links = Array.from(drawerLinks.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/docs", "/api"]);
    expect(links.map((a) => a.textContent.trim())).toEqual(["Home", "Docs", "API"]);
  });

  test("burger opens the drawer as a modal dialog and syncs aria-expanded", async () => {
    mount();
    await tick();
    expect(aside().getAttribute("role")).toBe("dialog"); // a drawer below the breakpoint
    expect(aside().getAttribute("aria-label")).toBe("Navigation");
    expect(aside().hasAttribute("aria-modal")).toBe(false); // closed: not modal

    burger().focus();
    burger().click();
    await tick();

    expect(aside().classList.contains("is-open")).toBe(true);
    expect(backdrop().classList.contains("is-open")).toBe(true);
    expect(root().hasAttribute("data-afw-sidebar-open")).toBe(true);
    expect(aside().getAttribute("aria-modal")).toBe("true");
    // The rest of the page is inert; the drawer's own shell (panel + backdrop) is not.
    expect(burger().closest("[inert]")).not.toBe(null);
    expect(aside().closest("[inert]")).toBe(null);
    expect(backdrop().closest("[inert]")).toBe(null);
    await frames();
    expect(document.activeElement).toBe(document.querySelector(".afwd-sidebar-close"));
    // No page scroll lock: scroll is contained by CSS (`overscroll-behavior`).
    expect(document.body.style.overflow).toBe("");
    // aria-expanded is mirrored across components via the afw:sidebar event.
    expect(burger().getAttribute("aria-expanded")).toBe("true");
  });

  test("on a desktop viewport the sidebar is not a dialog and never holds the page", async () => {
    window.matchMedia = (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} });
    mount();
    await tick();
    expect(aside().hasAttribute("role")).toBe(false);
    expect(aside().hasAttribute("aria-label")).toBe(false);
    window.__afwToggleSidebar();
    await tick();
    expect(aside().hasAttribute("aria-modal")).toBe(false);
    expect(document.querySelector("[inert]")).toBe(null);
  });

  test("the close button closes it, releases the page and returns focus to the burger", async () => {
    mount();
    await tick();

    burger().focus();
    burger().click();
    await tick();
    document.querySelector(".afwd-sidebar-close").click();
    await tick();

    expect(aside().classList.contains("is-open")).toBe(false);
    expect(root().hasAttribute("data-afw-sidebar-open")).toBe(false);
    expect(aside().hasAttribute("aria-modal")).toBe(false);
    expect(document.querySelector("[inert]")).toBe(null);
    expect(document.activeElement).toBe(burger());
    expect(burger().getAttribute("aria-expanded")).toBe("false");
  });

  test("clicking the backdrop closes the drawer", async () => {
    mount();
    await tick();

    burger().click();
    await tick();
    backdrop().click();
    await tick();

    expect(aside().classList.contains("is-open")).toBe(false);
    expect(burger().getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes the drawer", async () => {
    mount();
    await tick();

    burger().click();
    await tick();
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await tick();

    expect(aside().classList.contains("is-open")).toBe(false);
    expect(document.querySelector("[inert]")).toBe(null);
  });

  test("navigating closes the drawer", async () => {
    mount();
    await tick();

    burger().click();
    await tick();
    expect(aside().classList.contains("is-open")).toBe(true);

    // Simulate an SPA navigation (e.g. tapping a link in the drawer).
    setRouteState({ pathname: "/docs/routing" });
    await tick();

    expect(router.pathname).toBe("/docs/routing");
    expect(aside().classList.contains("is-open")).toBe(false);
    expect(document.querySelector("[inert]")).toBe(null);
  });

  test("unmounting clears the root flag, the global and the inert page", async () => {
    const { unmount } = mount();
    await tick();

    burger().click();
    await tick();
    expect(document.querySelector("[inert]")).not.toBe(null);

    unmount();
    await tick();

    expect(root().hasAttribute("data-afw-has-sidebar")).toBe(false);
    expect(window.__afwToggleSidebar).toBeUndefined();
    expect(document.querySelector("[inert]")).toBe(null);
  });

  test("the burger survives an overlapping remount (SPA navigation)", async () => {
    // Simulate navigating to another section: the new Sidebar mounts *before* the old
    // one unmounts. The flag and the toggle must remain available throughout (regression
    // for the burger vanishing after navigation).
    const first = mount();
    await tick();
    const firstToggle = window.__afwToggleSidebar;

    const second = mount(); // arrives before `first` leaves
    await tick();
    expect(root().hasAttribute("data-afw-has-sidebar")).toBe(true);
    // The newest Sidebar takes ownership of the global toggle.
    expect(window.__afwToggleSidebar).not.toBe(firstToggle);

    first.unmount(); // the old section's cleanup runs last
    await tick();

    // Still one Sidebar mounted → the burger remains visible and wired.
    expect(root().hasAttribute("data-afw-has-sidebar")).toBe(true);
    expect(typeof window.__afwToggleSidebar).toBe("function");

    // And it still drives the surviving drawer.
    const surviving = second.container.querySelector("#afw-sidebar");
    window.__afwToggleSidebar();
    await tick();
    expect(surviving.classList.contains("is-open")).toBe(true);
  });
});
