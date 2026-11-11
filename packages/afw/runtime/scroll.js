// Scroll restoration for client navigation (SPA mode).
//
// The browser's own restoration runs when the URL changes — before an async page
// (loader data, `loading.jsx`, resources) has rendered, so it lands on a short page
// or a skeleton. The router takes over instead (`history.scrollRestoration =
// "manual"`):
//
// - Each history entry carries a key in `history.state` (`afwKey`).
// - Leaving an entry saves its scroll position under that key (kept in
//   sessionStorage, so a reload restores it too).
// - Back/forward and reload restore the saved position once the page has
//   rendered, and keep retrying while the page is still too short to reach it —
//   until it fits, the user scrolls, or 2 s pass.

const STORE = "afw:scroll";
const LIMIT = 100; // entries kept; the oldest go first
const GIVE_UP_MS = 2000;

let positions = null;
let currentKey = null;
let stopPending = null;

function store() {
  if (positions) return positions;
  positions = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "{}");
    if (saved && typeof saved === "object") positions = saved;
  } catch {
    // Storage blocked (private mode, sandboxed iframe): positions last for this page only.
  }
  return positions;
}

function persist() {
  const keys = Object.keys(positions);
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete positions[key];
  try {
    sessionStorage.setItem(STORE, JSON.stringify(positions));
  } catch {
    // See `store`.
  }
}

const newKey = () => Math.random().toString(36).slice(2, 10);

/** Take over scroll restoration from the browser, and save the position on unload. */
let managing = false;
export function manageScroll() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (managing) return;
  managing = true;
  window.addEventListener("pagehide", rememberScroll);
}

/** Save the current entry's scroll position (call before the view changes). */
export function rememberScroll() {
  if (!currentKey) return;
  store()[currentKey] = [window.scrollX, window.scrollY];
  persist();
}

/**
 * Record the history entry a navigation lands on and make it current: a new entry
 * (`push`), the current one replaced (`replace`), or — for back/forward and the
 * first load — the entry already there, given a key if it has none.
 */
export function enterEntry(path, mode) {
  cancelRestore();
  if (mode === "pop") {
    let key = history.state?.afwKey;
    if (!key) {
      key = newKey();
      history.replaceState({ ...(history.state ?? {}), afwKey: key }, "");
    }
    currentKey = key;
    return key;
  }
  const key = newKey();
  if (mode === "replace") history.replaceState({ afwKey: key }, "", path);
  else history.pushState({ afwKey: key }, "", path);
  currentKey = key;
  return key;
}

/**
 * Restore the scroll position saved for `key`. Returns false when none was saved.
 * While the page is too short to reach it, it retries as the page grows.
 */
export function restoreScroll(key) {
  const saved = key ? store()[key] : null;
  if (!saved) return false;
  const [x, y] = saved;
  window.scrollTo(x, y);
  if (reached(y) || typeof ResizeObserver !== "function") return true;
  const observer = new ResizeObserver(() => {
    window.scrollTo(x, y);
    if (reached(y)) cancelRestore();
  });
  observer.observe(document.body);
  const timer = setTimeout(cancelRestore, GIVE_UP_MS);
  const events = ["wheel", "touchstart", "keydown", "pointerdown"];
  stopPending = () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const type of events) window.removeEventListener(type, cancelRestore, true);
  };
  for (const type of events) window.addEventListener(type, cancelRestore, { capture: true, passive: true });
  return true;
}

const reached = (y) => Math.abs(window.scrollY - y) < 2;

function cancelRestore() {
  const stop = stopPending;
  stopPending = null;
  stop?.();
}

/** Test hook: forget saved positions and the current entry. */
export function __resetScroll() {
  cancelRestore();
  positions = {};
  currentKey = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    // ignore
  }
}
