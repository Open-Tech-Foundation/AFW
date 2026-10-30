// Imported only by development compiler output. The Custom Elements registry
// caches lifecycle callbacks at define time, so stable callbacks dispatch to the
// current implementation rather than redefining an existing tag.
import { scope } from "../core/signals.js";
import { refreshHotRoute } from "./router.js";

const components = new Map();

// The `$state` slots of the page/layout view currently being built.
let routeSlots = null;

/**
 * A page/layout `$state` signal kept in the view's refresh slots: a refresh of the
 * same view reuses the signal (and its value) when the state shape is unchanged.
 */
export function hotRouteState(key, create) {
  if (!routeSlots) return create();
  if (!routeSlots.has(key)) routeSlots.set(key, create());
  return routeSlots.get(key);
}

/**
 * `exports` is the source of the page's exports other than its view and the route data the
 * router re-reads (see the compiler's `hot_exports_shape`). Importers hold the old values,
 * so a change there reloads; an edit to the view, its metadata or its headings refreshes.
 */
export function registerHotRoute(hot, factory, shape = "", exports = "", data = {}) {
  if (!hot) return factory;
  if (hot.data.afwRouteBoundary && hot.data.afwExports !== exports) {
    hot.data.afwExports = exports;
    hot.invalidate();
    return factory;
  }
  hot.data.afwExports = exports;
  hot.data.afwRouteBoundary = true;
  const record = hot.keep("afw-route", () => {
    const entry = { factory, shape };
    // `previous` is the view node this build replaces during a refresh. Its state
    // slots carry over when the declarations still match; otherwise state is fresh.
    entry.view = (props, previous) => {
      const kept = previous?.__afwHotSlots;
      const slots = kept && kept.shape === entry.shape ? kept.slots : new Map();
      let failed = false, failure;
      const outer = routeSlots;
      routeSlots = slots;
      let built;
      try {
        built = scope(() => {
          try { return entry.factory(props); }
          catch (error) { failed = true; failure = error; }
        });
      } finally {
        routeSlots = outer;
      }
      if (failed) {
        try { built.dispose(); } catch (error) { console.error(error); }
        throw failure;
      }
      const node = built.result;
      const lifecycle = node.__lifecycle ??= { mounts: [], cleanups: [] };
      lifecycle.cleanups.push(built.dispose);
      node.__afwHotFactory = entry.view;
      node.__afwHotSlots = { shape: entry.shape, slots };
      return node;
    };
    return entry;
  });
  const updated = record.factory !== factory || record.shape !== shape;
  record.factory = factory;
  record.shape = shape;
  // `data`: this update's `metadata`/`generateMetadata`/`toc`, which the router's import of
  // the route (the original module) would not see.
  record.data = data;
  hot.accept();
  if (updated) queueMicrotask(() => {
    if (!hot.data.afwInvalidated) void refreshHotRoute(record.view, record.data);
  });
  return record.view;
}

export function hotState(host, key, create) {
  const slots = host._hotState ??= new Map();
  if (!slots.has(key)) slots.set(key, create());
  return slots.get(key);
}

function cleanup(host) {
  const disposers = host._cleanups || [];
  host._cleanups = [];
  for (const dispose of disposers) {
    try { dispose(); } catch (error) { console.error(error); }
  }
}

function refresh(record, hosts) {
  for (const host of hosts) {
    if (!host.isConnected) continue;
    const scroll = [window.scrollX, window.scrollY];
    const focused = document.activeElement;
    const focusId = host.contains(focused) ? focused.id : null;
    const selection = focusId && typeof focused.selectionStart === "number"
      ? [focused.selectionStart, focused.selectionEnd] : null;
    cleanup(host);
    host._mounted = false;
    host._hotRefreshing = true;
    // Slotted children belong to the parent. Keep the original capture and move
    // those nodes into the new view in the same task (no genuine disconnect).
    host.replaceChildren(...(host._hotChildren || []));
    try { record.connected?.call(host); }
    finally { host._hotRefreshing = false; }
    if (focusId) {
      const target = document.getElementById(focusId);
      if (target && host.contains(target)) {
        target.focus({ preventScroll: true });
        if (selection && typeof target.setSelectionRange === "function") {
          try { target.setSelectionRange(...selection); } catch {}
        }
      }
    }
    window.scrollTo(...scroll);
  }
}

/**
 * `exports` is the source of the module's exports other than its components: importers
 * hold the old values, so a change there reloads, while an edit to the components alone
 * refreshes them in place. Each entry's shape covers what a refresh can't carry over
 * (props, state declarations, the exposed method names).
 */
/**
 * `$expose` in a development build: publish `api` on the host like `Object.assign`, after
 * removing whatever the previous version of the component exposed there. A refresh
 * re-runs the component on the same host, so a renamed or removed method would otherwise
 * linger beside its replacement.
 */
export function hotExpose(host, api) {
  for (const key of host.__afwExposed ?? []) if (!(key in api)) delete host[key];
  Object.assign(host, api);
  host.__afwExposed = Object.keys(api);
}

export function registerHotModule(hot, entries, accept = true, exports = "") {
  const signature = entries.map(([component, shape]) => [component.tag, shape]);
  const previous = hot?.data.afwSignature;
  if (previous && (JSON.stringify(previous) !== JSON.stringify(signature) || hot.data.afwExports !== exports)) {
    hot.data.afwInvalidated = true;
    hot.invalidate();
    return;
  }
  if (hot) {
    hot.data.afwSignature = signature;
    hot.data.afwExports = exports;
    hot.data.afwInvalidated = false;
  }
  const changed = [];
  for (const [component] of entries) {
    const tag = component.tag;
    let record = components.get(tag);
    const prototype = component.prototype;
    const connected = prototype.connectedCallback;
    const disconnected = prototype.disconnectedCallback;
    const attributeChanged = prototype.attributeChangedCallback;
    if (record) {
      Object.assign(record, { connected, disconnected, attributeChanged });
      changed.push(record);
      continue;
    }
    // A tag registered outside this refresh runtime cannot safely be replaced.
    if (customElements.get(tag)) {
      if (hot) hot.data.afwInvalidated = true;
      hot?.invalidate();
      continue;
    }
    record = { connected, disconnected, attributeChanged, instances: new Set() };
    components.set(tag, record);
    prototype.connectedCallback = function () {
      record.instances.add(this);
      return record.connected?.call(this);
    };
    prototype.disconnectedCallback = function () {
      record.instances.delete(this);
      return record.disconnected?.call(this);
    };
    if (attributeChanged) prototype.attributeChangedCallback = function (...args) {
      return record.attributeChanged.call(this, ...args);
    };
    customElements.define(tag, component);
  }
  // Install all implementations first. Refresh existing ancestors before their
  // descendants, so children recreated by a parent don't mount twice per update.
  const jobs = changed.flatMap(record => [...record.instances].map(host => {
    let depth = 0;
    for (let parent = host.parentElement; parent; parent = parent.parentElement) depth++;
    return { record, host, depth };
  }));
  jobs.sort((a, b) => a.depth - b.depth);
  for (const { record, host } of jobs) refresh(record, [host]);
  if (accept) hot?.accept();
}
