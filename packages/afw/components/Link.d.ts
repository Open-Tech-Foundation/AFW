import type { JSX } from "../jsx-runtime.js";
export interface LinkProps {
  href: string;
  children?: unknown;
  class?: JSX.IntrinsicElements["a"]["class"];
  reload?: boolean | "";
  /** Warm the route ahead of a click: `"intent"` (default: hover, focus, touch), `"viewport"`, or `false`. */
  prefetch?: "intent" | "viewport" | "none" | boolean;
  ariaLabel?: string;
  ariaCurrent?: string;
  "aria-label"?: string;
  "aria-current"?: string;
}
export default function Link(props: LinkProps): Node;
