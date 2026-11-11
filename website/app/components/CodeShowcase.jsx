// The hero's code window: a tab per sample (component, server function, page), with
// the file name in the window bar. Each sample's `html` comes from `highlight.js`:
// colored when prerendered, plain when rendered in the browser — then colored after
// mount, without holding up the page (see highlight.js).
import { RawHtml, onMount } from "@opentf/afw";
import { highlightSample } from "./highlight.js";

export default function CodeShowcase(props) {
  const samples = props.samples;
  let active = $state(0);
  let html = $state(samples.map((sample) => sample.html));
  const root = $ref();

  onMount(() => {
    // Hydrated from the prerender: already colored, nothing to load.
    if (root.querySelector(".code-window-pre [class^='sh-']")) return;
    Promise.all(samples.map(highlightSample)).then((list) => (html = list), () => {});
  });

  return (
    <div class="code-window" ref={root}>
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
          <pre class="code-window-pre"><code><RawHtml html={html[index]} /></code></pre>
        </div>
      ))}
    </div>
  );
}
