// Combobox — a text input that filters a list of options (WAI-ARIA list autocomplete).
//
// Controlled with `value` + `onValueChange`, or uncontrolled with `defaultValue`.
//
//   <Field label="Country">
//     <Combobox name="country" options={COUNTRIES} value={country} onValueChange={(v) => (country = v)} />
//   </Field>
//
//   // server-side search: no local filtering, options from your query
//   <Combobox filter={false} options={results} onInputChange={(q) => search(q)} />
//
// - Focus stays in the input. `aria-activedescendant` names the highlighted option, so a
//   screen reader follows it without focus moving into the list.
// - Typing filters and opens the list. ArrowDown/ArrowUp open it and move through the
//   options (wrapping); Enter chooses; Esc closes, or clears the text when it is closed;
//   Tab and blur close it. Pointer: hover highlights, click chooses — the input keeps focus.
// - Leaving with text that matches no option puts back the chosen option's label
//   (`allowCustomValue` keeps free text and reports it with `onValueChange`).
// - With `name`, a hidden input submits the option's value, not its label.
// - The number of results is announced, debounced while typing.
//
// `options` are strings or `{ value, label, disabled }`.

import { FieldContext } from "./Field.jsx";
import { announce } from "../internal/announce.js";
import { tether } from "../internal/position.js";

const slug = (value) => String(value).replace(/[^\w-]+/g, "-");
const normalize = (o) => (typeof o === "object" && o !== null ? { label: String(o.label ?? o.value), ...o } : { value: o, label: String(o) });

export function Combobox({
  options = [],
  value,
  defaultValue,
  onValueChange,
  onInputChange,
  filter = true,
  allowCustomValue = false,
  name,
  placeholder,
  emptyText = "No results",
  resultsText = (n) => (n === 1 ? "1 result" : `${n} results`),
  ...rest
}) {
  const field = $context(FieldContext);
  const ownId = $id();
  const listId = $id();
  const popupId = $id();
  const input = $ref();
  const popup = $ref();

  // Controlled with `value`, or uncontrolled from `defaultValue`.
  let internal = $state(defaultValue);
  const current = $derived(value == null ? internal : value); // an unset prop reads null
  const setValue = (v) => {
    internal = v;
    onValueChange?.(v);
  };
  const all = $derived((options ?? []).map(normalize));
  const selected = $derived(all.find((o) => o.value === current));
  let query = $state("");
  let open = $state(false);
  let active = $state(-1);
  let typed = $state(false); // filter only after the user types; reopening shows every option

  const shown = $derived(
    !filter || !typed || !query.trim()
      ? all
      : all.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const optionId = (o) => `${listId}-${slug(o.value)}`;
  const activeOption = $derived(open && active >= 0 ? shown[active] : undefined);

  // The chosen option's label is the text, whenever the choice changes from outside.
  $effect(() => {
    const label = selected?.label;
    if (label !== undefined) query = label;
    else if (!allowCustomValue && current == null) query = "";
  });

  // Show or hide the popup; size it to the input.
  $effect(() => {
    if (!popup || !input) return;
    const isOpen = popup.matches(":popover-open");
    if (open && !isOpen) {
      popup.style.minInlineSize = `${input.getBoundingClientRect().width}px`;
      try {
        popup.showPopover({ source: input });
      } catch {
        popup.showPopover();
      }
    } else if (!open && isOpen) popup.hidePopover();
  });

  // Keep the highlighted option in view.
  $effect(() => {
    const o = activeOption;
    if (o) document.getElementById(optionId(o))?.scrollIntoView({ block: "nearest" });
  });

  // Announce how many options match, once typing pauses.
  let announceTimer = 0;
  $effect(() => {
    const n = shown.length;
    if (!open || !typed) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(n ? resultsText(n) : emptyText), 500);
  });

  onMount(() => {
    const stop = tether(popup, input, "bottom-start");
    return () => {
      stop();
      clearTimeout(announceTimer);
    };
  });

  const enabledIndex = (from, step) => {
    const n = shown.length;
    for (let i = 1; i <= n; i++) {
      const at = (((from + step * i) % n) + n) % n;
      if (!shown[at].disabled) return at;
    }
    return -1;
  };
  const choose = (o) => {
    if (!o || o.disabled) return;
    query = o.label;
    typed = false;
    open = false;
    active = -1;
    setValue(o.value);
  };
  const revert = () => {
    if (allowCustomValue) {
      if (query !== (selected?.label ?? "")) setValue(query || undefined);
    } else query = selected?.label ?? "";
    typed = false;
  };

  const onInput = (e) => {
    query = e.currentTarget.value;
    typed = true;
    open = true;
    active = -1;
    onInputChange?.(query);
  };
  const onKeyDown = (e) => {
    if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          open = true;
          active = enabledIndex(-1, 1);
        } else active = enabledIndex(active, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) open = true;
        active = enabledIndex(active < 0 ? 0 : active, -1);
        break;
      case "Enter":
        if (open && activeOption) {
          e.preventDefault();
          choose(activeOption);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          open = false;
          active = -1;
        } else if (query) {
          e.preventDefault();
          query = "";
          typed = true;
          if (allowCustomValue || current != null) setValue(undefined);
        }
        break;
      case "Tab":
        open = false;
        break;
    }
  };
  const onBlur = () => {
    open = false;
    active = -1;
    revert();
  };

  return (
    <div class="afw-ui-combobox">
      <input
        {...rest}
        ref={input}
        type="text"
        role="combobox"
        id={field?.controlId ?? rest.id ?? ownId}
        class={["afw-ui-input", "afw-ui-combobox-input", rest.class]}
        value={query}
        placeholder={placeholder}
        autocomplete="off"
        aria-autocomplete="list"
        aria-expanded={open ? "true" : "false"}
        aria-controls={listId}
        aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
        aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
        aria-invalid={field?.invalid() ? "true" : rest["aria-invalid"]}
        required={field?.required() || "required" in rest || undefined}
        oninput={onInput}
        onkeydown={onKeyDown}
        onblur={onBlur}
        onclick={() => (open = !open)}
      />
      {name ? <input type="hidden" name={name} value={allowCustomValue && !selected ? query : (current ?? "")} /> : null}
      <div ref={popup} id={popupId} popover="manual" class="afw-ui-combobox-popup">
        <ul id={listId} role="listbox" class="afw-ui-combobox-list" aria-labelledby={field?.labelId} aria-label={field ? undefined : rest["aria-label"]}>
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={optionId(o)}
              role="option"
              class="afw-ui-combobox-option"
              aria-selected={o.value === current ? "true" : "false"}
              aria-disabled={o.disabled ? "true" : undefined}
              data-active={activeOption === o ? "" : undefined}
              onmousedown={(e) => e.preventDefault()}
              onpointermove={() => !o.disabled && active !== i && (active = i)}
              onclick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
        {shown.length ? null : <p class="afw-ui-combobox-empty">{emptyText}</p>}
      </div>
    </div>
  );
}
