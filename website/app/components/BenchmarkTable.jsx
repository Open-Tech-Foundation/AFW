// Renders a benchmark report as a homepage comparison table. Pure presentation —
// the values and the per-row winner (`best`) come from the report, so a table
// can't drift from the run it was recorded from.
//
// Used for both homepage tables: the runtime report (app/benchmark-report.json,
// written by `tsr bench -- all`, whose `best` already applies the
// timing-resolution tie rule) and the SSG build report (app/ssg-benchmark.json).
// `rowHeader` names what the rows are, since those differ — operations vs metrics.
// EngineBenchmarkTable.jsx is the same table turned: one row per engine.

import { CELL_CLS, HEAD_CLS, formatMs } from "./benchmark-format.js";

export default function BenchmarkTable(props) {
  const report = props.report;
  // The highlighted engines (AFW's columns), and the header text for each engine:
  // `labels` names a column when its key is not its name ("afw-esdev" → "AFW esdev").
  const leads = report.highlightEngines ?? [report.highlightEngine ?? report.engines[0]];
  const isLead = (engine) => leads.includes(engine);
  const label = (engine) => report.labels?.[engine] ?? engine;

  // Every cell's text + classes are precomputed here so the JSX `.map` bodies
  // below stay single expressions (no locals inside markup). Same styling rules
  // as the previous hand-rolled table: the lead engine's column reads in the main
  // text color (accent when it wins); other engines are muted unless they win.
  const columns = report.engines.map((engine) => ({
    engine,
    label: label(engine),
    cls: `${HEAD_CLS} ${isLead(engine) ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`,
  }));
  const rows = report.rows.map((row) => ({
    label: row.label,
    cells: report.engines.map((engine) => ({
      engine,
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
            <th className="px-6 py-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{props.rowHeader ?? "Operation"}</th>
            {columns.map((col) => (
              <th key={col.engine} className={col.cls}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-6 py-3 font-medium text-[var(--text-main)]">{row.label}</td>
              {row.cells.map((cell) => (
                <td key={cell.engine} className={cell.cls}>{cell.text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
