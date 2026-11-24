// Breakpoints and responsive values.
//
// - Named sizes in rem, so they follow the user's text size and zoom.
// - Layout props take a value or one per breakpoint: `gap={{ base: "sm", md: "lg" }}`.
//   Each breakpoint is a `data-*-<bp>` hook the theme matches with a container query, so a
//   component responds to the space it sits in (AppShellMain, Container, Card), not the
//   window. CSS only: right in the server HTML, nothing to wait for.
// - `viewport.atLeast("md")` is the script side, for what CSS can't do. It measures the
//   window and is `false` on the server.

import { signal } from "@opentf/afw";

/** min-widths, smallest first. `base` is everything below `sm`. */
export const breakpoints = Object.freeze({ sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" });

const NAMES = Object.keys(breakpoints);

/** A responsive value's entry for `bp` ("base" or a breakpoint name). A plain value is its base. */
export function at(value, bp) {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return bp === "base" ? value : undefined;
  const v = value[bp];
  return v == null ? undefined : v;
}

/** A breakpoint name as a CSS length (names resolve, lengths pass through). */
export function breakpointLength(nameOrLength) {
  return breakpoints[nameOrLength] ?? nameOrLength;
}

// One signal per breakpoint, created on first read and kept in step by matchMedia.
const queries = new Map();
function query(name) {
  let entry = queries.get(name);
  if (entry) return entry;
  const media = typeof matchMedia === "function" ? matchMedia(`(min-width: ${breakpoints[name]})`) : null;
  entry = signal(media ? media.matches : false);
  media?.addEventListener("change", (e) => (entry.value = e.matches));
  queries.set(name, entry);
  return entry;
}

/**
 * The window's width against the breakpoints, reactive: read it in a `$derived`, an
 * `$effect` or the JSX and it follows resizes. `false` on the server, so render the
 * narrow version there and let CSS (the responsive props) do layout.
 */
export const viewport = Object.freeze({
  /** At least `name` wide (`sm`, `md`, `lg`, `xl`). */
  atLeast(name) {
    if (!NAMES.includes(name)) throw new RangeError(`unknown breakpoint "${name}" (use ${NAMES.join(", ")})`);
    return query(name).value;
  },
  /** Narrower than `name`. */
  below(name) {
    return !viewport.atLeast(name);
  },
});
