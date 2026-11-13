// Live output for the Lazy Components page: the chart's code downloads only when it is
// first shown (or when the pointer rests on the button, which starts the download).
import { Pending } from "@opentf/afw";

const LazyChart = () => import("./LazyChart.jsx");

export default function LazyDemo() {
  let show = $state(false);
  let status = $state("Not loaded: its code is not part of this page yet.");
  const values = [12, 19, 7, 23, 16, 28, 21];

  async function open() {
    const t0 = performance.now();
    show = true;
    await LazyChart();
    status = `Loaded on demand in ${Math.round(performance.now() - t0)} ms, as its own chunk.`;
  }

  return (
    <div class="demo-output demo-output--jsx">
      <span class="demo-output-label">Output</span>
      <div class="demo-jsx-stack">
        <button class="demo-jsx-btn" onmouseenter={LazyChart} onclick={open} disabled={show}>Show the chart</button>
        <p class="demo-jsx-line demo-jsx-muted">{status}</p>
        {show && (
          <Pending fallback={<p class="demo-jsx-line demo-jsx-muted">Loading the chart…</p>}>
            <LazyChart values={values} />
          </Pending>
        )}
      </div>
    </div>
  );
}
