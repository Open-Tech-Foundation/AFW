// The transposed BenchmarkTable: one row per engine, one column per metric, the rows
// ordered by the metric named in `sortBy` (lowest first; engines without a value
// last). Used for the full-stack tables, where the engines outnumber the metrics.

import { CELL_CLS, HEAD_CLS, formatMs } from "./benchmark-format.js";

// One row per engine, one column per metric, sorted by `sortBy`.
export default function EngineBenchmarkTable(props) {
  const report = props.report;
  const leads = report.highlightEngines ?? [report.highlightEngine ?? report.engines[0]];
  const isLead = (engine) => leads.includes(engine);
  const label = (engine) => report.labels?.[engine] ?? engine;
  const key = report.rows.find((row) => row.label.startsWith(props.sortBy ?? "")) ?? report.rows[0];
  const sortValue = (engine) => (typeof key.values[engine] === "number" ? key.values[engine] : Infinity);
  const engines = [...report.engines].sort((a, b) => sortValue(a) - sortValue(b));
  const columns = report.rows.map((row) => ({
    label: row.label,
    cls: `${HEAD_CLS} ${row === key ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"}`,
  }));
  const rows = engines.map((engine) => ({
    engine,
    label: label(engine),
    labelCls: `px-6 py-3 font-medium ${isLead(engine) ? "text-[var(--accent)]" : "text-[var(--text-main)]"}`,
    cells: report.rows.map((row) => ({
      key: row.label,
      text: formatMs(row.values[engine], row.digits),
      cls:
        `${CELL_CLS} ` +
        (row.best === engine
          ? isLead(engine)
            ? "font-bold text-[var(--accent)]"
            : "font-bold text-[var(--text-main)]"
          : isLead(engine)
            ? "text-[var(--text-main)]"
            : "text-[var(--text-muted)]"),
    })),
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
            <th className="px-6 py-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{props.rowHeader ?? "Engine"}</th>
            {columns.map((col) => (
              <th key={col.label} className={col.cls}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.engine}>
              <td className={row.labelCls}>{row.label}</td>
              {row.cells.map((cell) => (
                <td key={cell.key} className={cell.cls}>{cell.text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
