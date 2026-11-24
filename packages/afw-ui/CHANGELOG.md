# @opentf/afw-ui

## [Unreleased]

### Added

- First release: accessible, headless components on native platform features —
  `Button`, `VisuallyHidden`, `Dialog`, `Popover`, `Tooltip`, `Menu`, `Tabs`,
  `Accordion`, `Field`, `TextField`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`,
  `Radio`, `Select`, `Toaster` with `toast()`, and `announce()`.
- `Switch` shows its state as a word inside the track ("On" / "Off", translatable with
  `onLabel` / `offLabel`), so it reads without relying on color or thumb position.
- `Combobox`: a text input that filters a list of options (WAI-ARIA list autocomplete) —
  `aria-activedescendant` highlighting, arrows/Enter/Esc, a hidden form value, free text
  with `allowCustomValue`, server-side search with `filter={false}` and `onInputChange`,
  debounced result-count announcements; controlled or uncontrolled (`defaultValue`).
- Layout: `Stack`, `Inline`, `Grid` (as many columns as fit), `Card` (an `<article>`
  whose regions are its children) and `Divider`.
- `AppShell` with `AppShellHeader`, `AppShellMenuButton`, `AppShellSidebar` and
  `AppShellMain`: landmarks and a skip link that moves focus into main; below
  `drawerBelow` the sidebar becomes a modal drawer (a `popover="manual"` dialog, page
  inert, Esc / outside press / link choice close it, focus returns to the menu button).
- `SideNav`, `SideNavItem`, `SideNavGroup`: links marked `aria-current="page"` from the
  router's path on the server and after each client navigation; groups open when they
  hold the current page.
- `PageHeader`, `Breadcrumbs` (`<nav>` + `<ol>`, the last link current, CSS separators)
  and `Pagination` (links with `href(page)` or buttons with `onPageChange`).
- `DialogDescription` renders a `<div>`, so rich descriptions hydrate in place.
- Built-in fallbacks (no polyfill packages) for invoker commands, anchor positioning,
  `focusgroup`, interest invokers and `popover="hint"`, `<dialog closedby>`, the
  `switch` input and `ariaNotify()`.
