// Tabs — the WAI-ARIA tabs pattern on `focusgroup="tablist"`.
//
//   <Tabs defaultValue="overview">
//     <TabList aria-label="Project">
//       <Tab value="overview">Overview</Tab>
//       <Tab value="activity">Activity</Tab>
//     </TabList>
//     <TabPanel value="overview">…</TabPanel>
//     <TabPanel value="activity">…</TabPanel>
//   </Tabs>
//
// - One Tab stop; arrows move between tabs (native `focusgroup`, or our fallback), Home
//   and End jump to the ends. Focus entering the list lands on the selected tab.
// - `activation="automatic"` (default): selection follows focus. Use "manual" when
//   showing a panel has a cost (a fetch, a URL change, a big layout shift): arrows move
//   focus, Enter/Space select.
// - The initial state is in the server HTML: `aria-selected` on the selected tab and
//   `hidden="until-found"` on every other panel, so nothing overlaps before hydration and
//   find-in-page can still reveal (and select) a hidden panel.
// - Not for page navigation: use links for that.

import { ContextProvider, createContext } from "@opentf/afw";
import { focusGroup } from "../internal/focus-group.js";

const TabsContext = createContext(null);

// A value as an id fragment (values are author strings: "billing info" → "billing-info").
const slug = (value) => String(value).replace(/[^\w-]+/g, "-");

export function Tabs({ value, defaultValue, onValueChange, activation = "automatic", children }) {
  const base = $id();
  let internal = $state(defaultValue);
  const api = {
    activation,
    selected: () => (value === undefined || value === null ? internal : value),
    select: (next) => {
      internal = next;
      onValueChange?.(next);
    },
    tabId: (v) => `${base}-tab-${slug(v)}`,
    panelId: (v) => `${base}-panel-${slug(v)}`,
  };
  return (
    <ContextProvider context={TabsContext} value={api}>
      <div class="afw-ui-tabs">{children}</div>
    </ContextProvider>
  );
}

export function TabList({ children, ...rest }) {
  const tabs = $context(TabsContext);
  const list = $ref();
  let group = null;
  const items = () => [...list.querySelectorAll("[data-afw-ui-tab]")].filter((t) => t.closest(".afw-ui-tab-list") === list);

  // Keep the Tab stop (and `focusgroupstart`) on the selected tab. A microtask, so the
  // tabs' own `aria-selected` bindings have applied the new selection first.
  const syncStop = () => {
    if (!group) return;
    for (const t of items()) t.toggleAttribute("focusgroupstart", t.getAttribute("aria-selected") === "true");
    group.sync();
  };
  $effect(() => {
    tabs?.selected();
    queueMicrotask(syncStop);
  });

  onMount(() => {
    group = focusGroup(list, {
      kind: "tablist",
      items,
      current: () => items().find((t) => t.getAttribute("aria-selected") === "true"),
    });
    syncStop();
    return () => {
      group.cleanup();
      group = null;
    };
  });

  return (
    <div {...rest} ref={list} class={["afw-ui-tab-list", rest.class]} focusgroup="tablist nomemory">
      {children}
    </div>
  );
}

export function Tab({ value, disabled = false, children, ...rest }) {
  const tabs = $context(TabsContext);
  const isSelected = $derived(tabs?.selected() === value);

  const onKeyDown = (event) => {
    if (tabs?.activation === "manual" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      tabs.select(value);
    }
  };
  const onFocus = () => {
    if (tabs?.activation !== "manual" && !disabled && !isSelected) tabs?.select(value);
  };

  return (
    <button
      {...rest}
      type="button"
      id={tabs?.tabId(value)}
      class={["afw-ui-tab", rest.class]}
      data-afw-ui-tab=""
      aria-selected={isSelected ? "true" : "false"}
      aria-disabled={disabled ? "true" : undefined}
      onclick={() => !disabled && tabs?.select(value)}
      onkeydown={onKeyDown}
      onfocus={onFocus}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, ...rest }) {
  const tabs = $context(TabsContext);
  const isSelected = $derived(tabs?.selected() === value);
  return (
    <div
      {...rest}
      role="tabpanel"
      id={tabs?.panelId(value)}
      class={["afw-ui-tab-panel", rest.class]}
      aria-labelledby={tabs?.tabId(value)}
      tabindex="0"
      hidden={isSelected ? undefined : "until-found"}
      onbeforematch={() => tabs?.select(value)}
    >
      {children}
    </div>
  );
}
