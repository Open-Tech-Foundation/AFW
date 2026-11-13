// The lazily loaded part of the Lazy Components demo: a small SVG bar chart. Its code is
// a separate chunk, downloaded the first time it renders.
export default function LazyChart({ values = [] }) {
  const max = $derived(Math.max(1, ...values));
  return (
    <svg class="demo-chart" viewBox={`0 0 ${values.length * 28} 100`} role="img" aria-label="Weekly visits">
      {values.map((v, i) => (
        <rect x={i * 28 + 4} y={100 - (v / max) * 90} width="20" height={(v / max) * 90} rx="3" />
      ))}
    </svg>
  );
}
