// Development refresh: component state carried across a rebuilt view.
//
// A page, layout or component refresh rebuilds its view, so the components it renders
// get new elements, and a new element starts with empty `$state`. Before the rebuild,
// the state of the elements about to be replaced is collected per tag, in document
// order; while the new view connects, each new element of that tag takes the next
// one (`hotState` in hmr.js). Matching by tag and position is how a component keeps
// its count when only the text around it was edited.
//
// Only refresh code calls `beginHotCarry`, so outside a refresh this is inert.

let carry = null;

const isHost = (el) => el?._hotState instanceof Map;

/**
 * Collect the state of every component element under `roots` (document order),
 * skipping the subtrees in `keep`: nodes the rebuild moves rather than recreates
 * (a layout's page, a component's slotted children).
 */
export function collectHotState(roots, keep = []) {
  const queues = new Map();
  const kept = (el) => keep.some((node) => node === el || node.contains?.(el));
  const add = (el) => {
    if (!isHost(el) || kept(el)) return;
    if (!queues.has(el.localName)) queues.set(el.localName, []);
    queues.get(el.localName).push(el._hotState);
  };
  for (const root of roots) {
    if (root?.nodeType !== 1) continue;
    add(root);
    for (const el of root.querySelectorAll("*")) add(el);
  }
  return queues;
}

/** Run `build` with `queues` available to the elements it connects. */
export function withHotCarry(queues, build) {
  const outer = carry;
  carry = queues.size ? queues : null;
  try {
    return build();
  } finally {
    carry = outer;
  }
}

/** The carried state for a newly connected `host`, or undefined. */
export function takeHotState(host) {
  const queue = carry?.get(host.localName);
  return queue?.length ? queue.shift() : undefined;
}
