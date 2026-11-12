// Revenue by region as SVG bars. Clicking a bar filters the table to that region.

export default function BarChart(props) {
  const max = $derived(() => Math.max(1, ...props.totals.map((t) => t.revenue)));
  return (
    <svg viewBox="0 0 400 140" class="w-full max-w-md" role="img" aria-label="Revenue by region">
      {props.totals.map((t, i) => (
        <g key={t.region} transform={`translate(${i * 100 + 10}, 0)`} onclick={() => props.onpick?.(t.region)} style={{ cursor: "pointer" }}>
          <rect
            x="0"
            y={110 - (t.revenue / max) * 90}
            width="70"
            height={(t.revenue / max) * 90}
            rx="4"
            fill={props.active === t.region ? "#818cf8" : "#4f46e5"}
          />
          <text x="35" y="126" text-anchor="middle" font-size="11" fill="#cbd5e1">{t.region}</text>
          <text x="35" y={105 - (t.revenue / max) * 90} text-anchor="middle" font-size="10" fill="#94a3b8">
            {Math.round(t.revenue / 1000)}k
          </text>
        </g>
      ))}
    </svg>
  );
}
