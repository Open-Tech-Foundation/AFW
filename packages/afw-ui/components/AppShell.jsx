// AppShell — the frame of an application: header, sidebar navigation, main content.
//
//   <AppShell>
//     <AppShellHeader>
//       <AppShellMenuButton />
//       <strong>Acme Console</strong>
//     </AppShellHeader>
//     <AppShellSidebar label="Main">
//       <SideNav>…</SideNav>
//     </AppShellSidebar>
//     <AppShellMain>…</AppShellMain>
//   </AppShell>
//
// - Landmarks: `<header>` (banner), the sidebar's navigation, `<main>`; a "Skip to content"
//   link is the first thing a keyboard reaches.
// - Wide (`drawerBelow` and up — a breakpoint name, default `lg`, or a CSS length): the
//   sidebar is an ordinary column, always shown.
// - Narrow: the sidebar becomes a drawer — a `popover="manual"` with `role="dialog"` and
//   `aria-modal`, opened by the menu button. While open the header and main are inert;
//   Esc, a click outside, choosing a link, or the menu button close it, and focus returns
//   to the menu button.
// - Main is a measuring region: responsive layout props inside it follow its width.
// - The shell sets `data-layout="sidebar" | "drawer"` and `data-drawer-open`, so a theme
//   styles both from one source and never repeats the breakpoint. Before hydration the
//   sidebar is a plain column.

import { ContextProvider, createContext } from "@opentf/afw";
import { breakpointLength } from "../internal/responsive.js";

const ShellContext = createContext(null);

export function AppShell({ drawerBelow = "lg", skipLabel = "Skip to content", children, ...rest }) {
  const sidebarId = $id();
  const mainId = $id();
  const menuButtonId = $id();
  const root = $ref();
  let layout = $state("sidebar");
  let open = $state(false);

  const api = {
    sidebarId,
    mainId,
    menuButtonId,
    layout: () => layout,
    isOpen: () => open,
    setOpen: (next) => (open = next),
  };

  onMount(() => {
    // "narrower than drawerBelow", in the long-standing syntax every engine parses.
    const query = matchMedia(`not all and (min-width: ${breakpointLength(drawerBelow)})`);
    const apply = () => {
      layout = query.matches ? "drawer" : "sidebar";
      if (!query.matches) open = false;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  });

  return (
    <ContextProvider context={ShellContext} value={api}>
      <div
        {...rest}
        ref={root}
        class={["afw-ui-shell", rest.class]}
        data-layout={layout}
        data-drawer-open={open ? "" : undefined}
      >
        {/* Focus main itself: following the fragment only moves the next Tab's starting
            point, so a screen reader would not land in the content. Without script the
            fragment link still scrolls there. */}
        <a
          class="afw-ui-skip-link"
          href={`#${mainId}`}
          onclick={(e) => {
            const main = document.getElementById(mainId);
            if (!main) return;
            e.preventDefault();
            main.focus();
          }}
        >
          {skipLabel}
        </a>
        {children}
      </div>
    </ContextProvider>
  );
}

export function AppShellHeader({ children, ...rest }) {
  const shell = $context(ShellContext);
  return (
    <header {...rest} class={["afw-ui-shell-header", rest.class]} inert={shell?.isOpen() ? "" : undefined}>
      {children}
    </header>
  );
}

// Shown in the drawer layout only (`hidden` otherwise), so it never sits in a wide layout.
// An icon with visually hidden text: `label` is its name.
export function AppShellMenuButton({ label = "Menu", ...rest }) {
  const shell = $context(ShellContext);
  return (
    <button
      {...rest}
      type="button"
      id={shell?.menuButtonId}
      class={["afw-ui-shell-menu-button", rest.class]}
      aria-controls={shell?.sidebarId}
      aria-expanded={shell?.isOpen() ? "true" : "false"}
      hidden={shell?.layout() === "drawer" ? undefined : ""}
      onclick={() => shell?.setOpen(!shell.isOpen())}
    >
      <span class="afw-ui-shell-menu-icon" aria-hidden="true"></span>
      <span style="position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap">
        {label}
      </span>
    </button>
  );
}

export function AppShellSidebar({ label = "Navigation", children, ...rest }) {
  const shell = $context(ShellContext);
  const el = $ref();

  // Drawer mode: a manual popover dialog. Sidebar mode: a plain column (no role, no popover).
  $effect(() => {
    if (!el || !shell) return;
    const drawer = shell.layout() === "drawer";
    if (drawer) {
      if (!el.hasAttribute("popover")) el.setAttribute("popover", "manual");
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", label);
    } else {
      if (el.matches(":popover-open")) el.hidePopover();
      el.removeAttribute("popover");
      el.removeAttribute("role");
      el.removeAttribute("aria-modal");
      el.removeAttribute("aria-label");
    }
  });

  // Open/close the drawer from state, with what a modal does natively.
  let wasOpen = false;
  $effect(() => {
    if (!el || !shell) return;
    const open = shell.isOpen() && shell.layout() === "drawer";
    if (open && !el.matches(":popover-open")) {
      el.showPopover();
      el.setAttribute("aria-modal", "true");
      // Focus the first link or control inside, for the keyboard.
      queueMicrotask(() => el.querySelector("a[href], button, [tabindex]:not([tabindex='-1'])")?.focus());
    } else if (!open && el.matches(":popover-open")) {
      el.hidePopover();
      el.removeAttribute("aria-modal");
    }
    if (wasOpen && !open) document.getElementById(shell.menuButtonId)?.focus();
    wasOpen = open;
  });

  onMount(() => {
    const close = () => shell?.isOpen() && shell.setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape" && shell?.isOpen()) {
        e.preventDefault();
        close();
      }
    };
    // A press outside the drawer (and not on the menu button) closes it.
    const onPointer = (e) => {
      if (!shell?.isOpen()) return;
      const button = document.getElementById(shell.menuButtonId);
      if (!el.contains(e.target) && !button?.contains(e.target)) close();
    };
    // Choosing a link navigates: close behind it.
    const onClick = (e) => {
      if (shell?.layout() === "drawer" && e.target.closest?.("a[href]")) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    el.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      el.removeEventListener("click", onClick);
    };
  });

  return (
    <div {...rest} ref={el} id={shell?.sidebarId} class={["afw-ui-shell-sidebar", rest.class]}>
      {children}
    </div>
  );
}

export function AppShellMain({ children, ...rest }) {
  const shell = $context(ShellContext);
  return (
    <main
      {...rest}
      id={shell?.mainId}
      tabindex="-1"
      class={["afw-ui-shell-main", rest.class]}
      inert={shell?.isOpen() ? "" : undefined}
    >
      {children}
    </main>
  );
}
