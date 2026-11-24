// Arrow-key navigation for composite widgets (tab lists, menus, toolbars, radio-like
// groups), with one Tab stop.
//
// Native: the markup carries `focusgroup="<kind> nomemory"`; the browser moves focus with
// the arrow keys and infers the roles (`tablist`/`tab`, `menu`/`menuitem`, `toolbar`).
// Home/End are handled here in both modes.
//
// Fallback (no `focusgroup`): this sets the roles the browser would infer, keeps a roving
// `tabindex` for groups you Tab into (not menus, which you enter with the keyboard from
// their trigger), and handles the arrow keys.

import { supportsFocusGroup } from "./support.js";

const ROLES = {
  tablist: ["tablist", "tab"],
  menu: ["menu", "menuitem"],
  toolbar: ["toolbar", null],
};

const ORIENTATION = { tablist: "horizontal", menu: "vertical", toolbar: "horizontal" };

function enabled(item) {
  return !item.disabled && item.getAttribute("aria-disabled") !== "true" && !item.hidden;
}

/**
 * Wire `group` (an element with `focusgroup`) as a `kind` group. `items()` lists its
 * focusable items in order; `current()` names the item that takes the Tab stop (the
 * selected tab), defaulting to the first enabled one. Returns `{ sync, cleanup }`: call
 * `sync()` after the items or the current item change.
 */
export function focusGroup(group, { kind, items, current = () => null, wrap = true }) {
  const native = supportsFocusGroup();
  const [groupRole, itemRole] = ROLES[kind] ?? [null, null];
  const orientation = group.getAttribute("aria-orientation") || ORIENTATION[kind] || "horizontal";
  const roving = kind !== "menu";

  const sync = () => {
    if (native) return;
    if (groupRole && !group.hasAttribute("role")) group.setAttribute("role", groupRole);
    const all = items();
    const stop = current() ?? all.find(enabled);
    for (const item of all) {
      // Checkable menu items and group wrappers carry their own roles.
      if (itemRole && !item.hasAttribute("role")) item.setAttribute("role", itemRole);
      if (roving) item.tabIndex = item === stop ? 0 : -1;
    }
  };

  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = items().filter(enabled);
    const at = list.indexOf(document.activeElement);
    if (at < 0) return;
    const rtl = getComputedStyle(group).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    let to = -1;
    if (event.key === "Home") to = 0;
    else if (event.key === "End") to = list.length - 1;
    else if (native) return; // the browser handles the arrows
    else if (event.key === (orientation === "vertical" ? "ArrowDown" : next)) to = at + 1;
    else if (event.key === (orientation === "vertical" ? "ArrowUp" : prev)) to = at - 1;
    else return;
    if (to < 0) to = wrap ? list.length - 1 : 0;
    if (to >= list.length) to = wrap ? 0 : list.length - 1;
    event.preventDefault();
    list[to].focus({ preventScroll: false });
  };

  sync();
  group.addEventListener("keydown", onKeyDown);
  return { sync, cleanup: () => group.removeEventListener("keydown", onKeyDown) };
}
