// Types for @opentf/afw-ui. Every component also accepts the attributes of the element
// it renders (`aria-*`, `data-*`, `id`, `name`, …): they are forwarded with `...rest`.

type Child = unknown;
type Attrs = Record<string, unknown>;
type Component<P> = (props: P & Attrs) => Node;
type Placement =
  | "bottom-start" | "bottom" | "bottom-end"
  | "top-start" | "top" | "top-end"
  | "right-start" | "right" | "left-start" | "left";

export const Button: Component<{
  variant?: "primary" | "secondary" | "ghost" | "danger" | (string & {});
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit" | "reset";
  /** Busy: `aria-busy`, still focusable, clicks ignored. */
  loading?: boolean;
  children?: Child;
}>;
export const VisuallyHidden: Component<{ children?: Child }>;

export const Dialog: Component<{
  open?: boolean;
  defaultOpen?: boolean;
  /** `returnValue` is the closing button's `value` ("" when dismissed). */
  onOpenChange?: (open: boolean, returnValue: string) => void;
  children?: Child;
}>;
export const DialogTrigger: Component<{ children?: Child }>;
export const DialogContent: Component<{
  /** How it may be dismissed: "any" adds click outside; "none" only by its buttons. */
  closedby?: "any" | "closerequest" | "none";
  children?: Child;
}>;
export const DialogTitle: Component<{ children?: Child }>;
export const DialogDescription: Component<{ children?: Child }>;
export const DialogClose: Component<{ value?: string; children?: Child }>;

export const Popover: Component<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: Child;
}>;
export const PopoverTrigger: Component<{ children?: Child }>;
export const PopoverContent: Component<{ placement?: Placement; mode?: "auto" | "manual"; children?: Child }>;
export const PopoverClose: Component<{ children?: Child }>;

export const Tooltip: Component<{
  content: Child;
  placement?: Placement;
  /** Hover delay in ms before it opens (fallback path; native uses `interest-delay`). */
  delay?: number;
  children?: Child;
}>;

export const Menu: Component<{ children?: Child }>;
export const MenuTrigger: Component<{ children?: Child }>;
export const MenuContent: Component<{ placement?: Placement; children?: Child }>;
export const MenuItem: Component<{
  /** A destination: renders a link that still opens in a new tab and works without script. */
  href?: string;
  disabled?: boolean;
  /** Runs on activation; call `event.preventDefault()` to keep the menu open. */
  onSelect?: (event: Event) => void;
  children?: Child;
}>;
export const MenuCheckboxItem: Component<{
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children?: Child;
}>;
export const MenuRadioGroup: Component<{ label: string; value?: string; onValueChange?: (value: string) => void; children?: Child }>;
export const MenuRadioItem: Component<{ value: string; disabled?: boolean; children?: Child }>;
export const MenuSeparator: Component<{}>;

export const Tabs: Component<{
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** "automatic": selection follows focus. "manual": Enter/Space select. */
  activation?: "automatic" | "manual";
  children?: Child;
}>;
export const TabList: Component<{ children?: Child }>;
export const Tab: Component<{ value: string; disabled?: boolean; children?: Child }>;
export const TabPanel: Component<{ value: string; children?: Child }>;

export const Accordion: Component<{ type?: "single" | "multiple"; children?: Child }>;
export const AccordionItem: Component<{ summary: Child; open?: boolean; onOpenChange?: (open: boolean) => void; children?: Child }>;

export const Field: Component<{ label: Child; description?: Child; error?: Child; required?: boolean; children?: Child }>;
export const TextField: Component<{ value?: string; type?: string; onValueChange?: (value: string) => void }>;
export const Textarea: Component<{ value?: string; onValueChange?: (value: string) => void }>;
export const Checkbox: Component<{ checked?: boolean; indeterminate?: boolean; onCheckedChange?: (checked: boolean) => void; children?: Child }>;
export const Switch: Component<{
  checked?: boolean;
  /** Visible state words inside the track (default "On" / "Off"); translate them here. */
  onLabel?: string;
  offLabel?: string;
  onCheckedChange?: (checked: boolean) => void;
  children?: Child;
}>;
export const RadioGroup: Component<{
  label: Child;
  name?: string;
  value?: string;
  description?: Child;
  onValueChange?: (value: string) => void;
  children?: Child;
}>;
export const Radio: Component<{ value: string; children?: Child }>;
export const Select: Component<{ value?: string; onValueChange?: (value: string) => void; children?: Child }>;

export type ComboboxOption = string | { value: string; label?: string; disabled?: boolean };
export const Combobox: Component<{
  options: ComboboxOption[];
  value?: string;
  /** The initial value when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
  /** Each change to the text (for server-side search with `filter={false}`). */
  onInputChange?: (text: string) => void;
  /** Filter `options` by the text (case-insensitive substring). Default true. */
  filter?: boolean;
  /** Keep text that matches no option, and report it as the value. */
  allowCustomValue?: boolean;
  /** Submit the chosen option's value under this name. */
  name?: string;
  placeholder?: string;
  emptyText?: string;
  resultsText?: (count: number) => string;
}>;

type TextSize = "xs" | "sm" | "md" | "lg";
/** `level` is the element (h1–h6); `size` only the look (default: by level, h1 → 2xl … h6 → xs). */
export const Heading: Component<{
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  size?: TextSize | "xl" | "2xl" | "3xl" | "display";
  children?: Child;
}>;
export const Text: Component<{
  as?: "p" | "span" | "div";
  size?: TextSize;
  tone?: "muted" | "danger" | "success" | "warning";
  weight?: "regular" | "medium" | "semibold" | "bold";
  /** One line with an ellipsis (visual only: the full text stays in the DOM). */
  truncate?: boolean;
  /** At most this many lines, then an ellipsis. */
  lines?: number;
  children?: Child;
}>;
/** An app path ("/…") follows the locale and navigates on the client. */
export const TextLink: Component<{ href: string; external?: boolean; newTabLabel?: string; children?: Child }>;
export const Code: Component<{ children?: Child }>;
/** `keys={["Ctrl", "K"]}`: one <kbd> per key, joined by `separator`; otherwise `children`. */
export const Kbd: Component<{ keys?: string[]; separator?: string; children?: Child }>;
export const CodeBlock: Component<{ label?: string; language?: string; children?: Child }>;

type Space = "xs" | "sm" | "md" | "lg" | "xl";
export type Breakpoint = "sm" | "md" | "lg" | "xl";
/**
 * One value, or one per breakpoint: `{ base: "sm", md: "lg" }`. A breakpoint is the width
 * of the space the component sits in (the nearest AppShellMain, Container or Card).
 */
export type Responsive<T> = T | ({ base?: T } & { [B in Breakpoint]?: T });
/** Breakpoint min-widths: sm 40rem, md 48rem, lg 64rem, xl 80rem. */
export const breakpoints: Readonly<Record<Breakpoint, string>>;
/** The window against the breakpoints, reactive; `false` on the server. */
export const viewport: { atLeast(name: Breakpoint): boolean; below(name: Breakpoint): boolean };

export const Stack: Component<{
  gap?: Responsive<Space>;
  align?: Responsive<"start" | "center" | "end">;
  direction?: Responsive<"column" | "row">;
  children?: Child;
}>;
export const Inline: Component<{
  gap?: Responsive<Space>;
  align?: Responsive<"start" | "center" | "end" | "baseline">;
  justify?: Responsive<"start" | "center" | "end" | "between">;
  wrap?: boolean;
  children?: Child;
}>;
/**
 * As many columns as fit at `min` wide (a CSS length), down to one; or `columns` equal
 * columns from the breakpoint given.
 */
export const Grid: Component<{ min?: string; gap?: Responsive<Space>; columns?: Responsive<number>; children?: Child }>;
/** A centred column capped at `size`, with notch-safe side padding; a measuring region. */
export const Container: Component<{ size?: Breakpoint | "full"; children?: Child }>;
export const Card: Component<{ children?: Child }>;
export const Divider: Component<{}>;

export const AppShell: Component<{
  /** Below this width — a breakpoint name or a CSS length — the sidebar is a drawer. Default "lg". */
  drawerBelow?: Breakpoint | (string & {});
  skipLabel?: string;
  children?: Child;
}>;
export const AppShellHeader: Component<{ children?: Child }>;
export const AppShellMenuButton: Component<{ label?: string }>;
export const AppShellSidebar: Component<{ label?: string; children?: Child }>;
export const AppShellMain: Component<{ children?: Child }>;

export const SideNav: Component<{ label?: string; children?: Child }>;
export const SideNavItem: Component<{ href: string; exact?: boolean; children?: Child }>;
export const SideNavGroup: Component<{ label: Child; open?: boolean; children?: Child }>;
export const PageHeader: Component<{ title: Child; description?: Child; children?: Child }>;
export const Breadcrumbs: Component<{ items: { label: Child; href: string }[]; label?: string }>;
export const Pagination: Component<{
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  /** Render links (a URL per page) instead of buttons. */
  href?: (page: number) => string;
  siblings?: number;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  pageLabel?: (page: number) => string;
}>;
export function pageRange(page: number, count: number, siblings?: number): (number | "…")[];

export interface ToastOptions {
  title?: string;
  tone?: "info" | "success" | "warning" | "danger";
  /** Dismiss after this many ms (paused while the pointer or focus is inside). Default: until closed. */
  duration?: number;
}
export const Toaster: Component<{ label?: string; closeLabel?: string }>;
export function toast(message: string, options?: ToastOptions): number;
export function dismissToast(id: number): void;
export function clearToasts(): void;

/** Announce text to screen readers without moving focus. */
export function announce(text: string, options?: { priority?: "normal" | "high" }): void;
