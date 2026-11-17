// Revalidation triggers for `resource(…, { revalidateOn })` (docs/DATA.md §3): when the
// tab becomes visible again ("focus") or the browser comes back online ("online"), a
// resource whose data is older than its `staleTime` refetches. One listener per event
// serves every resource; nothing is installed until a resource asks.

const watchers = { focus: new Set(), online: new Set() };
let installed = false;

function fire(event) {
  for (const fn of [...watchers[event]]) fn();
}

function install() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fire("focus");
  });
  globalThis.addEventListener?.("online", () => fire("online"));
}

/** Normalize `revalidateOn` to a list of events, refusing unknown ones. */
export function revalidateEvents(value) {
  const events = value == null ? [] : Array.isArray(value) ? value : [value];
  for (const event of events) {
    if (!(event in watchers)) throw new TypeError(`revalidateOn: expected "focus" or "online", got ${JSON.stringify(event)}`);
  }
  return events;
}

/** Call `fn` on each of `events`; returns the unwatch function. */
export function watch(events, fn) {
  if (events.length === 0) return () => {};
  install();
  for (const event of events) watchers[event].add(fn);
  return () => {
    for (const event of events) watchers[event].delete(fn);
  };
}
