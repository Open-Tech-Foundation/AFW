// Admonition / callout box. `type` is note | tip | info | warning | danger.
//
//   <Callout type="warning" title="Heads up">…</Callout>

const ICONS = {
  note: "✎",
  tip: "💡",
  info: "🛈",
  warning: "⚠",
  danger: "⛔",
};

export default function Callout(props) {
  const type = props.type || "note";
  const title = props.title || type.charAt(0).toUpperCase() + type.slice(1);
  const icon = ICONS[type] || ICONS.note;

  return (
    <div class={"afwd-callout afwd-callout-" + type}>
      <span class="afwd-callout-icon" aria-hidden="true">
        {icon}
      </span>
      <div class="afwd-callout-content">
        <div class="afwd-callout-title">{title}</div>
        <div class="afwd-callout-body">{props.children}</div>
      </div>
    </div>
  );
}
