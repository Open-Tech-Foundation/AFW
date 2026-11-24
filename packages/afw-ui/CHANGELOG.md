# @opentf/afw-ui

## [Unreleased]

### Added

- First release: accessible, headless components on native platform features —
  `Button`, `VisuallyHidden`, `Dialog`, `Popover`, `Tooltip`, `Menu`, `Tabs`,
  `Accordion`, `Field`, `TextField`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`,
  `Radio`, `Select`, `Toaster` with `toast()`, and `announce()`.
- `Switch` shows its state as a word inside the track ("On" / "Off", translatable with
  `onLabel` / `offLabel`), so it reads without relying on color or thumb position.
- Built-in fallbacks (no polyfill packages) for invoker commands, anchor positioning,
  `focusgroup`, interest invokers and `popover="hint"`, `<dialog closedby>`, the
  `switch` input and `ariaNotify()`.
