// Search box trigger in the navbar. Calls the global opener that the AFW Search-backed
// <Search> modal installs on `window` (the ⌘K / Ctrl+K shortcut opens it too). Shows
// the shortcut as a hint; the modifier resolves to ⌘ on Apple platforms, Ctrl
// elsewhere, on mount. The accessible name is the visible text ("Search Ctrl K"), so
// what a speech-input user reads on the button is what they can say to press it
// (WCAG 2.5.3, "Label in Name"); `aria-keyshortcuts` announces the shortcut itself.

import { onMount } from "@opentf/afw";

export default function SearchTrigger() {
  let mod = $state("Ctrl");

  onMount(() => {
    const ua = navigator.platform || navigator.userAgent || "";
    if (/Mac|iPhone|iPad|iPod/.test(ua)) mod = "⌘";
  });

  const open = () => {
    if (typeof window !== "undefined" && typeof window.__afwOpenSearch === "function") {
      window.__afwOpenSearch();
    }
  };

  return (
    <button type="button" class="afwd-search-trigger" onclick={open} aria-keyshortcuts="Control+K Meta+K">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round" />
      </svg>
      <span class="afwd-search-label">Search</span>{" "}
      <kbd class="afwd-search-kbd">{() => `${mod} K`}</kbd>
    </button>
  );
}
