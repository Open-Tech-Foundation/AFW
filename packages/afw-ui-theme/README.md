# @opentf/afw-ui-theme

The default theme for [`@opentf/afw-ui`](../afw-ui): plain CSS in cascade layers, with
the macOS system blue as its accent.

- The primary action is the system blue with white text.
- The **accent edge**: one 2px blue edge for selected, current and focused — the active
  tab, menu item and toast, and the focus ring. Selection always has a second cue.
- Radius by role: 6px controls, 10px overlays, pills only for switches.
- Depth only for what floats: dialogs, menus, popovers, toasts.
- Light and dark (`prefers-color-scheme`, or `data-theme="light" | "dark"`), three
  densities (`data-density="compact" | "comfortable" | "spacious"`), forced colors and
  reduced motion.
- Every text pair meets 4.5:1 and every indicator and control boundary 3:1, in both modes.

## Install

```bash
pnpm add @opentf/afw-ui-theme
```

```css
@import "@opentf/afw-ui-theme"; /* tokens + components */
@import "@opentf/afw-ui-theme/tokens"; /* or the tokens alone */
```

## Customize

Everything sits in the `afw-ui.*` layers, so unlayered app CSS wins without specificity
tricks. Re-theme with tokens:

```css
:root {
  --afw-ui-accent: #4f46e5;
  --afw-ui-accent-edge: #4338ca;
  --afw-ui-accent-ink: #ffffff;
  --afw-ui-radius-control: 4px;
}
```

| Token | Role |
| --- | --- |
| `--afw-ui-ink`, `--afw-ui-muted` | text, secondary text |
| `--afw-ui-canvas`, `--afw-ui-surface`, `--afw-ui-raised`, `--afw-ui-subtle` | page, panels, overlays, hover |
| `--afw-ui-line`, `--afw-ui-control-border` | dividers, control boundaries |
| `--afw-ui-accent`, `--afw-ui-accent-ink`, `--afw-ui-accent-edge`, `--afw-ui-accent-text` | primary fill, text on it, indicators, accented text |
| `--afw-ui-danger`, `--afw-ui-success`, `--afw-ui-warning`, `--afw-ui-info` | status |
| `--afw-ui-control-h`, `--afw-ui-pad-x`, `--afw-ui-gap`, `--afw-ui-row-h` | density |
| `--afw-ui-font`, `--afw-ui-text-*` | type (Geist, 14px body) |

License: MIT
