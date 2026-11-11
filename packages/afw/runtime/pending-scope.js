// How a resource finds the `<Pending>` boundaries that wait on it (pending.js).
// Kept apart from the element so resource.js stays small.
//
// - A resource created in a component under a boundary: the component's host is
//   connected by then, so the boundary is its nearest `afw-internal-pending`
//   ancestor (hopping across portals, like context).
// - A resource read while a boundary's children are being built (a page resource
//   passed down as props): the compiler brackets that build with
//   `enterPending` / `exitPending`, and the read registers with that boundary.

const building = [];

/** Compiler-emitted around the build of a `<Pending>`'s children. */
export function enterPending(el) {
  building.push(el);
}

/** Compiler-emitted (in a `finally`) after the build of a `<Pending>`'s children. */
export function exitPending() {
  const el = building.pop();
  el?.__built?.();
}

/** The boundary whose children are being built right now, or null. */
export function buildingPending() {
  return building.length ? building[building.length - 1] : null;
}

/** The nearest `<Pending>` around `node`, across portals, or null. */
export function closestPending(node) {
  let el = node;
  while (el && el.closest) {
    const boundary = el.closest("afw-internal-pending");
    if (boundary) return boundary;
    const portal = el.closest("[data-afw-portal]");
    el = portal ? portal.__portalHost : null;
  }
  return null;
}
