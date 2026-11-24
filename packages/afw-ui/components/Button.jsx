// Button and VisuallyHidden — the two small primitives the rest build on.
//
//   <Button variant="primary" onclick={save}>Save changes</Button>
//   <Button variant="ghost" aria-label="Close"><Icon/></Button>
//   <Button loading>Saving…</Button>
//
// A native <button>, `type="button"` unless given another. `variant` and `size` are
// styling hooks (`data-variant`, `data-size`) for a theme; this component draws nothing.
// `loading` keeps the button focusable and named, marks it `aria-busy`, and ignores
// clicks — a disabled button would drop focus and vanish from the Tab order mid-action.

export function Button({ variant = "secondary", size = "md", type = "button", loading = false, children, ...rest }) {
  // A consumer's `onclick` sits on the host (an ancestor), so stopping the click here
  // keeps it from running while loading.
  const onClick = (e) => {
    if (loading) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    <button
      {...rest}
      type={type}
      class={["afw-ui-button", rest.class]}
      data-variant={variant}
      data-size={size}
      aria-busy={loading ? "true" : undefined}
      onclick={onClick}
    >
      {children}
    </button>
  );
}

// Content for screen readers only (an icon button's text, a table caption): hidden
// visually but kept in the accessibility tree, unlike `hidden` or `display: none`.
export function VisuallyHidden({ children }) {
  return (
    <span
      class="afw-ui-visually-hidden"
      style="position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap"
    >
      {children}
    </span>
  );
}
