# @opentf/afw-ui

Accessible, headless UI components for [AFW](https://afw.opentechf.org), built on the
platform's own dialog, popover and form controls.

- **Native first:** `<dialog>`, `popover`, invoker commands (`commandfor`), `interestfor`,
  `focusgroup`, `<details name>`, the customizable `<select>`. The browser provides focus
  handling, top-layer rendering, light dismiss and keyboard behavior.
- **Works before hydration:** triggers are invokers, so dialogs and menus open from the
  server HTML where the browser supports invoker commands.
- **Own fallbacks, no polyfills:** where a feature is missing, a small built-in fallback
  takes over (positioning, arrow-key groups, hover hints, light dismiss, invokers, switch).
- **Headless:** nothing is drawn. Style the `.afw-ui-*` part classes and the ARIA/`data-*`
  state, or use [`@opentf/afw-ui-theme`](../afw-ui-theme).
- **Server-rendered:** stable ids (`$id()`), context across parts, attributes forwarded
  with `...rest` — in SSG/SSR as on the client.

## Install

```bash
pnpm add @opentf/afw-ui @opentf/afw-ui-theme
```

```css
/* app stylesheet */
@import "@opentf/afw-ui-theme";
```

## Use

```jsx
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "@opentf/afw-ui";

export default function DeleteProject() {
  return (
    <Dialog>
      <DialogTrigger>Delete project</DialogTrigger>
      <DialogContent role="alertdialog">
        <DialogTitle>Delete this project?</DialogTitle>
        <DialogClose autofocus>Keep it</DialogClose>
        <DialogClose value="delete">Delete</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
```

## Components

| Component | Built on |
| --- | --- |
| `Button`, `VisuallyHidden` | `<button>` |
| `Dialog` (+ `Trigger`, `Content`, `Title`, `Description`, `Close`) | `<dialog>` + `showModal()` |
| `Popover` (+ `Trigger`, `Content`, `Close`) | `popover="auto"` |
| `Tooltip` | `popover="hint"` + `interestfor` |
| `Menu` (+ `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Separator`) | `popover` + `focusgroup="menu"` |
| `Tabs` (+ `TabList`, `Tab`, `TabPanel`) | `focusgroup="tablist"` + `hidden="until-found"` |
| `Accordion`, `AccordionItem` | `<details name>` |
| `Field`, `TextField`, `Textarea` | `<label>`, `<input>`, `<textarea>` |
| `Checkbox`, `Switch`, `RadioGroup`, `Radio`, `Select` | native inputs, `<fieldset>`, `<select>` |
| `Toaster`, `toast()` | `popover="manual"` region + `ariaNotify` |

## Fallbacks

| Feature | Without it |
| --- | --- |
| Invoker commands | the trigger's click runs the command |
| Anchor positioning | fixed coordinates, flipped and clamped to the viewport |
| `focusgroup` | roles, roving `tabindex` and arrow keys |
| `interestfor` / `popover="hint"` | hover (after a delay) and keyboard focus open the hint |
| `<dialog closedby>` | press-and-release outside closes; `cancel` guards `closedby="none"` |
| `<input switch>` | `role="switch"` |
| `ariaNotify()` | a polite or assertive live region |
| Customizable `<select>` | the OS picker |

## Styling hooks

- Part classes: `.afw-ui-dialog`, `.afw-ui-menu-item`, `.afw-ui-tab`, …
- State: `[aria-expanded]`, `[aria-selected]`, `[aria-checked]`, `[aria-invalid]`,
  `[aria-busy]`, `:popover-open`, `[open]`, `data-variant`, `data-size`, `data-tone`,
  `data-placement`.
- `--afw-ui-offset`: the gap between a trigger and its overlay.

License: MIT
