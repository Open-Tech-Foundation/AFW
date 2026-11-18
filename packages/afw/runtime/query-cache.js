// The query cache (docs/DATA.md §3): server function results and keyed resources,
// shared by every caller in the page.
//
// • Dedupe — identical calls in flight share one request. The request is aborted only
//   once every caller has aborted.
// • Freshness — an entry younger than a caller's `staleTime` answers without a request.
//   The default `staleTime` is 0, so the cache shares requests but always revalidates.
// • Sync reads — a resource that knows its key up front (`resource(source, listTodos)`
//   or `{ key }`) shows a cached entry at once, so a remount skips the loading state.
// • Lifetime — an entry no resource uses is dropped `gcTime` (default 5 minutes) after
//   its last use. Sweeps run as the cache is used; there are no timers.
//
// Keys: `endpoint + encoded input`, with plain-object keys sorted, so `{ a, b }` and
// `{ b, a }` are the same entry. Cached data is shared: treat it as immutable.
//
// Overlays: `optimistic()` stacks an updater on an entry while an action runs. Readers
// see the entry's *view* (its data through every overlay); fetches and writes replace
// the data underneath, and the overlay comes off when the action settles.

import { encode } from "../core/fn-codec.js";

export const DEFAULT_GC_TIME = 5 * 60_000;
const SWEEP_EVERY = 1000;

const entries = new Map(); // key → entry
let lastSweep = 0;

const now = () => Date.now();

/** Plain objects with sorted keys, recursively; other values as they are. */
function canonical(value, seen = new Map()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (const item of value) out.push(canonical(item, seen));
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Date, Map, … encode as they are
  const out = {};
  seen.set(value, out);
  for (const k of Object.keys(value).sort()) {
    // defineProperty: a `__proto__` key stays an own property, as the codec keeps it.
    Object.defineProperty(out, k, { value: canonical(value[k], seen), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** The cache key of a server function call. */
export function callKey(endpoint, input) {
  return `${endpoint}\u0000${encode(canonical(input))}`;
}

/** The cache key a resource's `key` option names. */
export function customKey(key) {
  return `key\u0000${encode(canonical(key))}`;
}

/** The endpoint part of a call key, or null for a custom key. */
export function endpointOfKey(key) {
  const i = key.indexOf("\u0000");
  const head = key.slice(0, i);
  return head === "key" ? null : head;
}

function sweep(force = false) {
  const t = now();
  if (!force && t - lastSweep < SWEEP_EVERY) return;
  lastSweep = t;
  for (const [key, e] of entries) {
    if (e.users === 0 && !e.flight && t - e.idleSince >= e.gcTime) entries.delete(key);
  }
}

function entryFor(key) {
  sweep();
  let e = entries.get(key);
  if (!e) {
    e = {
      key,
      data: undefined,
      hasData: false,
      updatedAt: 0,
      stale: false, // invalidated: never fresh, whatever the staleTime
      flight: null,
      listeners: new Set(),
      users: 0,
      idleSince: now(),
      gcTime: DEFAULT_GC_TIME,
      // What the fetcher behind a custom key called (endpoints and call keys), so a
      // cache hit, which runs no fetcher, still registers for `invalidate()`.
      deps: null,
      // The server function call behind the entry, `[endpoint, input]` (an action sends
      // the shown calls so it can refresh them), or null for a custom key.
      call: null,
      overlays: [],
    };
    entries.set(key, e);
  }
  return e;
}

/** The entry for `key`, if one exists (no entry is created). */
export function peek(key) {
  return entries.get(key);
}

/** What readers see of `e`: its data through every optimistic overlay. */
export function viewOf(e) {
  let value = e.data;
  for (const overlay of e.overlays) value = overlay(value);
  return value;
}

/** Tell the resources showing `e` that its view changed. */
function notify(e) {
  if (e.listeners.size === 0) return;
  const value = viewOf(e);
  for (const listener of [...e.listeners]) listener(value);
}

/** Every entry, for invalidation and optimistic updates (`[key, entry]`). */
export function allEntries() {
  return entries.entries();
}

/** Does `e` hold data younger than `staleTime`? */
export function isFresh(e, staleTime) {
  return !!e?.hasData && !e.stale && now() - e.updatedAt < staleTime;
}

/** Store `data` under `key` and tell the resources that show it. */
export function write(key, data, deps) {
  const e = entryFor(key);
  e.data = data;
  e.hasData = true;
  e.updatedAt = now();
  e.stale = false;
  if (deps) e.deps = deps;
  if (e.users === 0) e.idleSince = e.updatedAt;
  notify(e);
  return e;
}

/** Stack `overlay` on `e` (an optimistic update); returns its removal. */
export function addOverlay(e, overlay) {
  e.overlays.push(overlay);
  notify(e);
  return () => {
    const i = e.overlays.indexOf(overlay);
    if (i === -1) return;
    e.overlays.splice(i, 1);
    notify(e);
  };
}

/**
 * The data for `key`: a fresh entry's data, the request already in flight, or a new
 * request made with `start(signal)`. `signal` aborts this caller only; the request
 * stops once every caller has aborted.
 */
export function fetchShared(key, start, { signal, staleTime = 0, deps, call } = {}) {
  const e = entryFor(key);
  if (call) e.call ??= call;
  if (isFresh(e, staleTime)) return Promise.resolve(viewOf(e));
  if (!e.flight) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const flight = { controller, active: 0, entry: e, promise: null };
    // The async IIFE starts the request synchronously and turns a throw into a rejection.
    flight.promise = (async () => start(controller?.signal))().then(
      (data) => {
        // A detached flight (invalidated, or aborted by all callers) writes nothing.
        if (e.flight === flight) {
          e.flight = null;
          write(key, data, deps?.());
          return viewOf(e); // through any optimistic overlay still on it
        }
        return data;
      },
      (error) => {
        if (e.flight === flight) e.flight = null;
        throw error;
      },
    );
    e.flight = flight;
  }
  return join(e.flight, signal);
}

function join(flight, signal) {
  flight.active++;
  if (!signal) return flight.promise;
  if (signal.aborted) {
    leave(flight);
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      leave(flight);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    flight.promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function leave(flight) {
  if (--flight.active > 0) return;
  if (flight.entry.flight === flight) flight.entry.flight = null;
  flight.controller?.abort();
}

/**
 * A resource shows `key`: it hears every write and keeps the entry alive. Returns the
 * unsubscribe function.
 */
export function subscribe(key, listener, { gcTime = DEFAULT_GC_TIME } = {}) {
  const e = entryFor(key);
  e.users++;
  // The longest `gcTime` among the entry's current users wins.
  e.gcTime = e.users === 1 ? gcTime : Math.max(e.gcTime, gcTime);
  e.listeners.add(listener);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    e.listeners.delete(listener);
    if (--e.users === 0) e.idleSince = now();
  };
}

/**
 * Remove entries outright (`clearQueryCache`): their data, and the requests in flight for
 * them, which then write nothing. `match(key, entry)` picks them; with none, every entry.
 * Returns the removed keys. Unlike `markStale`, nothing is left to show on a remount.
 */
export function dropEntries(match) {
  const dropped = [];
  for (const [key, e] of entries) {
    if (match && !match(key, e)) continue;
    entries.delete(key);
    e.flight = null;
    e.data = undefined;
    e.hasData = false;
    e.overlays = [];
    dropped.push(key);
  }
  return dropped;
}

/**
 * Mark entries stale and detach their requests in flight, so the next read fetches
 * again. `match(key, entry)` picks them; with none, every entry.
 */
export function markStale(match) {
  for (const [key, e] of entries) {
    if (match && !match(key, e)) continue;
    e.stale = true;
    e.flight = null;
  }
}

/** Drop every entry (tests only). */
export function __resetQueryCache() {
  entries.clear();
  lastSweep = 0;
}

/** How many entries are cached (tests only). */
export function __queryCacheSize() {
  sweep(true);
  return entries.size;
}
