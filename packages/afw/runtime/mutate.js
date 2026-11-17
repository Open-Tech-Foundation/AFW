// Writing to the query cache (docs/DATA.md §3): after an action, from a realtime push,
// or optimistically while an action runs.
//
//   setQueryData(getTodo, { id: 1 }, (todo) => ({ ...todo, done: true }));
//   await optimistic(addTodo({ title }), listTodos, (todos) => [...todos, { title }]);
//
// An action that calls `refresh()` on the server sends fresh query data with its
// response; the browser stub hands it to `applyRefresh`, so the page updates in the
// same round trip.

import { cacheChanged, endpointOf, settleRefresh } from "./invalidate.js";
import { addOverlay, allEntries, callKey, endpointOfKey, peek, write } from "./query-cache.js";

function endpointFrom(fn, name) {
  const endpoint = endpointOf(fn);
  if (!endpoint) throw new TypeError(`${name}() takes a server function imported from a .server module`);
  return endpoint;
}

/**
 * Store data for one server function call: `value`, or `value(current)` when it is a
 * function. Every resource showing the call updates; nothing is fetched.
 */
export function setQueryData(fn, input, value) {
  const endpoint = endpointFrom(fn, "setQueryData");
  const key = callKey(endpoint, input);
  const current = peek(key);
  const next = typeof value === "function" ? value(current?.data) : value;
  const e = write(key, next);
  e.call ??= [endpoint, input];
  cacheChanged(key);
}

/**
 * Show `update(data)` for a server function's cached calls until `promise` settles,
 * then take it off: the fresh data an action's `refresh()` sent shows on success, the
 * previous data on failure. `optimistic(promise, fn, update)` covers every cached
 * input of `fn`; `optimistic(promise, fn, input, update)` one. Returns `promise`'s
 * outcome.
 */
export function optimistic(promise, fn, ...rest) {
  const endpoint = endpointFrom(fn, "optimistic");
  const update = rest.length >= 2 ? rest[1] : rest[0];
  if (typeof update !== "function") throw new TypeError("optimistic(promise, fn, [input], update): update must be a function");
  const only = rest.length >= 2 ? callKey(endpoint, rest[0]) : null;
  const removals = [];
  for (const [key, e] of allEntries()) {
    if (!e.hasData || (only ? key !== only : endpointOfKey(key) !== endpoint)) continue;
    removals.push([key, addOverlay(e, update)]);
  }
  for (const [key] of removals) cacheChanged(key);
  return Promise.resolve(promise).finally(() => {
    for (const [key, remove] of removals) {
      remove();
      cacheChanged(key);
    }
  });
}

/**
 * Apply an action's `refresh` payload: write the fresh calls, mark the rest of the
 * refreshed endpoints stale, and refetch what the response did not cover. Resolves once
 * those refetches settle.
 */
export async function applyRefresh({ fresh = [], stale = [], endpoints = [] } = {}) {
  const written = fresh.map(([endpoint, input, data]) => ({ endpoint, input, data, key: callKey(endpoint, input) }));
  const freshKeys = new Set(written.map((w) => w.key));
  const pending = settleRefresh(
    endpoints,
    freshKeys,
    stale.map(([endpoint, ...input]) => ({ endpoint, key: input.length ? callKey(endpoint, input[0]) : null })),
  );
  for (const { endpoint, input, data, key } of written) {
    const e = write(key, data);
    e.call ??= [endpoint, input];
    cacheChanged(key);
  }
  await pending;
}
