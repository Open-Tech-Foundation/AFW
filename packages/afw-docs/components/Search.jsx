// AFW Search-backed modal. The navbar's `SearchTrigger` and the global
// ⌘K / Ctrl+K shortcut open it via `window.__afwOpenSearch`, which this component
// installs on mount. The static index is generated after a release build (the `siteOutputPlugin`
// output hook, with `docs.search.provider === "afw"`) lives at `/_search/`; the reader is lazy so
// pages without a search never fetch its index.
//
// Note: results only exist against a built site (`dist/`). In dev there is no index,
// so the modal opens but reports no results — expected.
import { onCleanup, onMount, router } from "@opentf/afw";
import { createSearch, excerptParts } from "../search.js";

const search = createSearch({ base: "/_search/" });

export default function Search() {
  let open = $state(false);
  let query = $state("");
  let results = $state([]);
  let active = $state(0);
  let loading = $state(false);
  let error = $state("");
  let controller;
  const inputRef = $ref();
  const dialogRef = $ref();

  let timer;
  let token = 0;

  async function runSearch(q) {
    const mine = ++token;
    controller?.abort();
    controller = new AbortController();
    error = "";
    if (!q.trim()) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    try {
      const found = await search.query(q, { limit: 10, signal: controller.signal });
      if (mine !== token) return; // a newer query superseded this one
      results = found.results;
      active = 0;
    } catch (e) {
      if (mine === token && e?.name !== "AbortError") {
        results = [];
        error = "Search is unavailable. Please try again.";
      }
    } finally {
      if (mine === token) loading = false;
    }
  }

  $effect(() => {
    const q = query;
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(q), 150);
  });

  // A native modal <dialog>: the browser makes the page behind it inert, keeps focus
  // inside, closes it on Escape (and other platform close requests) and returns focus to
  // whatever opened it. `autofocus` on the field puts the cursor there on open.
  const openModal = () => {
    const dialog = dialogRef;
    if (!dialog || dialog.open) return;
    open = true;
    dialog.showModal();
  };
  // Every way the dialog closes (Escape, a result, the backdrop) ends here, via `close`.
  const reset = () => {
    ++token;
    controller?.abort();
    clearTimeout(timer);
    loading = false;
    error = "";
    open = false;
    query = "";
    results = [];
    active = 0;
  };
  const close = () => {
    if (dialogRef?.open) dialogRef.close();
    else reset();
  };
  const go = (url) => {
    close();
    router.push(url);
  };

  onMount(() => {
    if (typeof window === "undefined") return;
    window.__afwOpenSearch = openModal;
    const onKey = (e) => {
      const k = e.key;
      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === "k") {
        e.preventDefault();
        openModal();
        return;
      }
      if (!open) return;
      if (k === "ArrowDown") {
        e.preventDefault();
        active = results.length ? (active + 1) % results.length : 0;
      } else if (k === "ArrowUp") {
        e.preventDefault();
        active = results.length ? (active - 1 + results.length) % results.length : 0;
      } else if (k === "Enter" && results[active]) {
        e.preventDefault();
        go(results[active].url);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (window.__afwOpenSearch === openModal) delete window.__afwOpenSearch;
    };
  });

  onCleanup(() => {
    ++token;
    clearTimeout(timer);
    controller?.abort();
  });

  // A modal <dialog> renders in the top layer, above the navbar's `backdrop-filter`
  // containing block, so it needs no portal. A click outside the panel lands on the
  // dialog itself (it fills the viewport) and closes it.
  return (
    <dialog
      ref={dialogRef}
      class="afwd-search-modal"
      aria-label="Search docs"
      onclose={reset}
      onclick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="afwd-search-panel">
        <div class="afwd-search-field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round" />
          </svg>
          <input
            ref={inputRef}
            class="afwd-search-input-field"
            type="search"
            placeholder="Search docs…"
            aria-label="Search docs"
            autofocus
            value={query}
            oninput={(e) => (query = e.target.value)}
          />
        </div>
        <ul class="afwd-search-results">
          {results.map((r, i) => (
            <li>
              <a
                href={r.url}
                class={i === active ? "afwd-search-result is-active" : "afwd-search-result"}
                onclick={(e) => {
                  e.preventDefault();
                  go(r.url);
                }}
                onmouseenter={() => (active = i)}
              >
                {r.meta?.breadcrumb ? <span class="afwd-search-result-crumb">{r.meta.breadcrumb}</span> : null}
                <span class="afwd-search-result-title">{r.title}</span>
                {r.section ? <span class="afwd-search-result-section">{r.section}</span> : null}
                <span class="afwd-search-result-excerpt">
                  {excerptParts(r.excerpt, r.highlights).map((part) => <span>{part.match ? <mark>{part.text}</mark> : part.text}</span>)}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {error ? <div class="afwd-search-empty" role="status">{error}</div> : null}
        {query.trim() && !loading && !error && results.length === 0 ? (
          <div class="afwd-search-empty">No results for “{query}”.</div>
        ) : null}
        <div class="afwd-search-hint">
          <span class="afwd-search-hint-item">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span class="afwd-search-hint-item">
            <kbd>↵</kbd>
            select
          </span>
          <span class="afwd-search-hint-item">
            <kbd>esc</kbd>
            close
          </span>
        </div>
      </div>
    </dialog>
  );
}
