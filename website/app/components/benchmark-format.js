// Shared by BenchmarkTable and EngineBenchmarkTable.

export const HEAD_CLS = "px-4 py-3 text-xs font-bold uppercase tracking-widest text-right";
export const CELL_CLS = "px-4 py-3 text-right font-mono";

// One decimal by default ("243.35 → 243.4", "278.7 → 278.7"), or the row's own
// `digits`; missing → em dash.
export function formatMs(value, digits) {
  if (typeof value !== "number") return "—";
  return digits === undefined ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(digits);
}
