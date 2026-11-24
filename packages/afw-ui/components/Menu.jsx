// Menu — a popup list of commands and links, on `popover` + `focusgroup="menu"`.
//
//   <Menu>
//     <MenuTrigger>Actions</MenuTrigger>
//     <MenuContent>
//       <MenuItem onSelect={rename}>Rename</MenuItem>
//       <MenuItem href="/settings">Settings</MenuItem>
//       <MenuSeparator />
//       <MenuCheckboxItem checked={grid} onCheckedChange={(v) => (grid = v)}>Show grid</MenuCheckboxItem>
//       <MenuRadioGroup label="Sort by" value={sort} onValueChange={(v) => (sort = v)}>
//         <MenuRadioItem value="name">Name</MenuRadioItem>
//         <MenuRadioItem value="date">Date</MenuRadioItem>
//       </MenuRadioGroup>
//     </MenuContent>
//   </Menu>
//
// Keyboard and focus (the platform's menu-button behavior):
// - The trigger is an ordinary button and Tab stop; focusing it does not open the menu.
// - Enter/Space/click toggle it natively (an invoker). A keyboard open focuses the first
//   item; a pointer open leaves focus on the trigger, without a ring.
// - ArrowDown on the trigger opens it (if needed) and focuses the first item; ArrowUp the
//   last. Inside: arrows move, Home/End jump, Esc closes and returns focus to the trigger.
// - Choosing a command closes the menu and returns focus to the trigger (no ring after a
//   pointer choice). A checkbox item toggles; Enter also closes, Space keeps it open.
// - Tab leaves the menu and closes it; focus never stays inside hidden content.
// Pointer hover focuses the item under it, so hover and focus are one item.

import { ContextProvider, createContext } from "@opentf/afw";
import { focusGroup } from "../internal/focus-group.js";
import { invoker } from "../internal/invoke.js";
import { tether } from "../internal/position.js";

const MenuContext = createContext(null);
const RadioContext = createContext(null);

const items = (group) =>
  [...group.querySelectorAll("button, a[href]")].filter((i) => i.closest("[focusgroup]") === group);
const enabled = (i) => !i.disabled && i.getAttribute("aria-disabled") !== "true";

export function Menu({ children }) {
  const menuId = $id();
  const triggerId = $id();
  let open = $state(false);

  const state = { enterOnOpen: null, pointer: false };
  const el = () => document.getElementById(menuId);
  const trigger = () => document.getElementById(triggerId);
  const group = () => el()?.querySelector("[focusgroup]");

  const api = {
    menuId,
    triggerId,
    isOpen: () => open,
    setOpen: (next) => (open = next),
    // Open from the keyboard and land on the first (or last) enabled item.
    openAndEnter: (where = "first") => {
      const menu = el();
      if (!menu) return;
      if (menu.matches(":popover-open")) api.enter(where);
      else {
        state.enterOnOpen = where;
        trigger()?.click(); // the invoker is the one open path
      }
    },
    enter: (where) => {
      const list = group() ? items(group()).filter(enabled) : [];
      (where === "last" ? list.at(-1) : list[0])?.focus();
    },
    // Close and put focus back on the trigger (without a ring after a pointer action).
    close: ({ fromPointer = false } = {}) => {
      const t = trigger();
      if (t) t.focus({ focusVisible: !fromPointer });
      const menu = el();
      if (menu?.matches(":popover-open")) menu.hidePopover();
    },
    state,
  };

  return (
    <ContextProvider context={MenuContext} value={api}>
      {children}
    </ContextProvider>
  );
}

export function MenuTrigger({ children, ...rest }) {
  const menu = $context(MenuContext);
  const button = $ref();

  onMount(() => {
    const stop = invoker(button);
    // A pointer press must not move focus: arrow keys still work after a pointer open
    // (the toggle handler focuses the trigger without a ring).
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      menu.state.pointer = true;
    };
    const click = (e) => {
      // Enter/Space produce a click with no pointer detail: a keyboard open enters.
      if (e.detail === 0 && !menu.state.pointer && !menu.isOpen()) menu.state.enterOnOpen ??= "first";
      menu.state.pointer = false;
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("click", click);
    return () => {
      stop();
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("click", click);
    };
  });

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      menu?.openAndEnter(e.key === "ArrowUp" ? "last" : "first");
    }
  };

  return (
    <button
      {...rest}
      ref={button}
      id={menu?.triggerId}
      type="button"
      class={["afw-ui-menu-trigger", rest.class]}
      aria-haspopup="menu"
      aria-expanded={menu?.isOpen() ? "true" : "false"}
      commandfor={menu?.menuId}
      command="toggle-popover"
      onkeydown={onKeyDown}
    >
      {children}
    </button>
  );
}

export function MenuContent({ placement = "bottom-start", children, ...rest }) {
  const menu = $context(MenuContext);
  const el = $ref();
  const list = $ref();

  onMount(() => {
    const trigger = document.getElementById(menu.triggerId);
    const stopTether = trigger ? tether(el, trigger, placement) : null;
    const fg = focusGroup(list, { kind: "menu", items: () => items(list) });

    const onToggle = (e) => {
      const opened = e.newState === "open";
      menu.setOpen(opened);
      if (opened) {
        fg.sync();
        const where = menu.state.enterOnOpen;
        menu.state.enterOnOpen = null;
        if (where) menu.enter(where);
        else trigger?.focus({ focusVisible: false });
      } else if (el.contains(document.activeElement)) {
        trigger?.focus(); // closed with focus inside (Esc, script): never leave it in hidden content
      }
    };
    // Tab (or a click) taking focus out of the menu closes it.
    const onFocusOut = (e) => {
      const to = e.relatedTarget;
      if (to && !el.contains(to) && to !== trigger && el.matches(":popover-open")) el.hidePopover();
    };
    // Hover follows focus.
    const onPointerMove = (e) => {
      const item = e.target.closest?.("button, a[href]");
      if (item && enabled(item) && item.closest("[focusgroup]") === list && document.activeElement !== item) {
        item.focus({ focusVisible: false });
      }
    };
    el.addEventListener("toggle", onToggle);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("pointermove", onPointerMove);
    return () => {
      stopTether?.();
      fg.cleanup();
      el.removeEventListener("toggle", onToggle);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("pointermove", onPointerMove);
    };
  });

  return (
    <div ref={el} id={menu?.menuId} popover="auto" class="afw-ui-menu" data-placement={placement}>
      <div {...rest} ref={list} class={["afw-ui-menu-list", rest.class]} focusgroup="menu nomemory" aria-labelledby={menu?.triggerId}>
        {children}
      </div>
    </div>
  );
}

// Activate an item: run its handler, then (unless it called preventDefault) close.
function activate(menu, event, run, { close = true } = {}) {
  run?.(event);
  if (close && !event.defaultPrevented) menu?.close({ fromPointer: event.detail > 0 });
}

export function MenuItem({ href, disabled = false, onSelect, children, ...rest }) {
  const menu = $context(MenuContext);
  const onClick = (event) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    // A link navigates on its own; close the menu behind it.
    activate(menu, event, onSelect);
  };
  return href ? (
    <a
      {...rest}
      href={disabled ? undefined : href}
      class={["afw-ui-menu-item", rest.class]}
      aria-disabled={disabled ? "true" : undefined}
      onclick={onClick}
    >
      {children}
    </a>
  ) : (
    <button
      {...rest}
      type="button"
      class={["afw-ui-menu-item", rest.class]}
      aria-disabled={disabled ? "true" : undefined}
      onclick={onClick}
    >
      {children}
    </button>
  );
}

export function MenuCheckboxItem({ checked = false, disabled = false, onCheckedChange, children, ...rest }) {
  const menu = $context(MenuContext);
  let space = false;
  const onKeyDown = (e) => (space = e.key === " ");
  const onClick = (event) => {
    if (disabled) return;
    const keep = space; // Space toggles and stays open; Enter and click close
    space = false;
    activate(menu, event, () => onCheckedChange?.(!checked), { close: !keep });
  };
  return (
    <button
      {...rest}
      type="button"
      role="menuitemcheckbox"
      class={["afw-ui-menu-item", rest.class]}
      aria-checked={checked ? "true" : "false"}
      aria-disabled={disabled ? "true" : undefined}
      onkeydown={onKeyDown}
      onclick={onClick}
    >
      {children}
    </button>
  );
}

export function MenuRadioGroup({ label, value, onValueChange, children }) {
  const api = { value: () => value, choose: (v) => onValueChange?.(v) };
  return (
    <ContextProvider context={RadioContext} value={api}>
      <div role="group" aria-label={label} class="afw-ui-menu-group">
        {children}
      </div>
    </ContextProvider>
  );
}

export function MenuRadioItem({ value, disabled = false, children, ...rest }) {
  const menu = $context(MenuContext);
  const radio = $context(RadioContext);
  const onClick = (event) => {
    if (disabled) return;
    activate(menu, event, () => radio?.choose(value));
  };
  return (
    <button
      {...rest}
      type="button"
      role="menuitemradio"
      class={["afw-ui-menu-item", rest.class]}
      aria-checked={radio?.value() === value ? "true" : "false"}
      aria-disabled={disabled ? "true" : undefined}
      onclick={onClick}
    >
      {children}
    </button>
  );
}

// A native separator: not focusable, skipped by the arrows.
export function MenuSeparator() {
  return <hr class="afw-ui-menu-separator" />;
}
