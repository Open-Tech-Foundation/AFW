// The navbar's menu on small screens, for pages without a sidebar drawer (a marketing
// home, a landing page): a button that opens the top-level links below the bar. On
// pages with a sidebar the links live in the drawer instead, so CSS shows this button
// only below the sidebar breakpoint and only while no <Sidebar> is mounted
// (`:root:not([data-afw-has-sidebar])`). It closes on navigation and on Escape.

import { onMount, router } from "@opentf/afw";
import NavbarLink from "./NavbarLink.jsx";

export default function NavbarMenu(props) {
  const links = props.links || [];
  let open = $state(false);

  // A navigation (any link, here or elsewhere) closes the menu.
  $effect(() => {
    router.pathname;
    open = false;
  });

  onMount(() => {
    const onKey = (e) => {
      if (e.key === "Escape") open = false;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div class="afwd-navbar-menu-wrap">
      <button
        class="afwd-navbar-icon afwd-navbar-menu-toggle"
        onclick={() => (open = !open)}
        aria-label="Menu"
        aria-controls="afw-navbar-menu"
        aria-expanded={open ? "true" : "false"}
      >
        {() =>
          open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
      </button>
      {() =>
        open ? (
          <nav id="afw-navbar-menu" class="afwd-navbar-menu" aria-label="Menu">
            {links.map((l) => (
              <NavbarLink link={l} />
            ))}
          </nav>
        ) : null}
    </div>
  );
}
