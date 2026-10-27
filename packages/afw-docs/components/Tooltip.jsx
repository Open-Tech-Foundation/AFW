// A small hover/focus tooltip. CSS-driven (no JS state) — wrap any element and pass
// `text`; the bubble shows on hover or keyboard focus of the wrapped content.
//
//   <Tooltip text="Change theme"><button>…</button></Tooltip>
//
// `placement` is "bottom" (default) or "top". The bubble is aria-hidden decorative
// chrome; give the wrapped control its own `aria-label` for assistive tech.

export default function Tooltip(props) {
  const placement = props.placement === "top" ? "afwd-tooltip-top" : "afwd-tooltip-bottom";
  return (
    <span class={`afwd-tooltip ${placement}`}>
      {props.children}
      <span class="afwd-tooltip-bubble" role="tooltip" aria-hidden="true">
        {props.text}
      </span>
    </span>
  );
}
