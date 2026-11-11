// The hero's code window: a tab per sample (component, server function, page), each
// highlighted by `highlight.js` (its `html`), with the file name in the window bar.
import { RawHtml } from "@opentf/afw";

export default function CodeShowcase(props) {
  const samples = props.samples;
  let active = $state(0);

  return (
    <div class="code-window">
      <div class="code-window-bar">
        <span class="code-window-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="code-window-tabs" role="tablist" aria-label="Code samples">
          {samples.map((sample, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={active === index ? "true" : "false"}
              class={active === index ? "code-window-tab is-active" : "code-window-tab"}
              onclick={() => (active = index)}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>
      {samples.map((sample, index) => (
        <div class={active === index ? "code-window-panel" : "code-window-panel is-hidden"} role="tabpanel">
          <div class="code-window-file">{sample.file}</div>
          <pre class="code-window-pre"><code><RawHtml html={sample.html} /></code></pre>
        </div>
      ))}
    </div>
  );
}
