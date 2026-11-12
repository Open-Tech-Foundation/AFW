// A data explorer built only from AFW: a resource for the data, $derived filtering,
// sorting and paging, a keyed table with inline editing and enter/exit transitions,
// child components with callback props, an SVG chart, children and $expose.
// The page loads it lazily: `const DataExplorer = () => import("./explorer/DataExplorer.jsx")`.

import { resource } from "@opentf/afw";
import { fade } from "@opentf/afw/transition";
import BarChart from "./BarChart.jsx";
import Toolbar from "./Toolbar.jsx";

const REGIONS = ["North", "South", "East", "West"];
const PRODUCTS = ["Keyboard", "Monitor", "Mouse", "Laptop", "Headset", "Webcam", "Dock", "Tablet", "Router", "Speaker"];
const PAGE_SIZE = 12;

/** Deterministic sample rows (a small linear congruential generator). */
function makeRows(count, seed) {
  let x = seed;
  const next = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, (_, i) => {
    const units = 1 + Math.floor(next() * 90);
    const price = Math.round((20 + next() * 980) * 100) / 100;
    return {
      id: i + 1,
      product: `${PRODUCTS[Math.floor(next() * PRODUCTS.length)]} ${String.fromCharCode(65 + Math.floor(next() * 26))}${1 + Math.floor(next() * 9)}`,
      region: REGIONS[Math.floor(next() * REGIONS.length)],
      units,
      price,
    };
  });
}

/** Pretend to fetch: the rows arrive after a short delay. */
const fetchRows = (count) => new Promise((resolve) => setTimeout(() => resolve(makeRows(count, count + Date.now() % 7)), 500));

const COLUMNS = [
  { key: "id", label: "#" },
  { key: "product", label: "Product" },
  { key: "region", label: "Region" },
  { key: "units", label: "Units" },
  { key: "price", label: "Price" },
  { key: "revenue", label: "Revenue" },
];

const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function DataExplorer(props) {
  const data = resource(() => props.rows ?? 1000, fetchRows);

  let query = $state("");
  let region = $state("all");
  let sortKey = $state("revenue");
  let sortDir = $state(-1);
  let page = $state(0);
  let edits = $state({}); // id → edited units
  let editing = $state(null); // the id whose units are being edited
  let selected = $state(null);

  const rows = $derived(() =>
    (data.data ?? []).map((r) => {
      const units = edits[r.id] ?? r.units;
      return { ...r, units, revenue: Math.round(units * r.price), edited: r.id in edits };
    }),
  );
  const filtered = $derived(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (region === "all" || r.region === region) && (!q || r.product.toLowerCase().includes(q)));
  });
  const sorted = $derived(() =>
    [...filtered].sort((a, b) => (a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0) * sortDir),
  );
  const pages = $derived(() => Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)));
  const visible = $derived(() => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
  const totals = $derived(() =>
    REGIONS.map((name) => ({ region: name, revenue: filtered.filter((r) => r.region === name).reduce((s, r) => s + r.revenue, 0) })),
  );
  const revenue = $derived(() => filtered.reduce((s, r) => s + r.revenue, 0));

  const sortBy = (key) => {
    if (sortKey === key) sortDir = -sortDir;
    else {
      sortKey = key;
      sortDir = key === "product" || key === "region" ? 1 : -1;
    }
    page = 0;
  };
  const setQuery = (value) => {
    query = value;
    page = 0;
  };
  const setRegion = (value) => {
    region = value;
    page = 0;
  };
  const commitUnits = (id, text) => {
    const units = Number.parseInt(text, 10);
    if (Number.isFinite(units) && units > 0) edits = { ...edits, [id]: units };
    editing = null;
  };
  const choose = (row) => {
    selected = row.id;
    props.onselect?.(row);
  };

  $expose({
    reset: () => {
      query = "";
      region = "all";
      sortKey = "revenue";
      sortDir = -1;
      page = 0;
      edits = {};
      selected = null;
    },
    count: () => filtered.length,
  });

  return (
    <div class="space-y-5">
      <Toolbar
        query={query}
        region={region}
        regions={REGIONS}
        shown={filtered.length}
        total={rows.length}
        onquery={setQuery}
        onregion={setRegion}
        onreload={() => data.refetch()}
      />

      <div class="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div class="overflow-hidden rounded-xl border border-slate-700">
          <table class="w-full text-sm">
            <thead class="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} class="px-3 py-2">
                    <button type="button" onclick={() => sortBy(c.key)} class={{ "font-bold text-indigo-300": sortKey === c.key }}>
                      {c.label}
                      {sortKey === c.key ? (sortDir > 0 ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  in={fade({ duration: 150 })}
                  onclick={() => choose(r)}
                  class={{
                    "cursor-pointer border-t border-slate-700/60 hover:bg-slate-700/40": true,
                    "bg-indigo-500/20": selected === r.id,
                  }}
                >
                  <td class="px-3 py-1.5 text-slate-500">{r.id}</td>
                  <td class="px-3 py-1.5 text-slate-100">{r.product}</td>
                  <td class="px-3 py-1.5">{r.region}</td>
                  <td class="px-3 py-1.5" ondblclick={() => (editing = r.id)} title="Double-click to edit">
                    {editing === r.id ? (
                      <input
                        type="number"
                        value={r.units}
                        autofocus
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => {
                          if (e.key === "Enter") commitUnits(r.id, e.currentTarget.value);
                          if (e.key === "Escape") editing = null;
                        }}
                        onblur={(e) => commitUnits(r.id, e.currentTarget.value)}
                        class="w-20 rounded border border-indigo-400 bg-slate-900 px-1 text-slate-100"
                      />
                    ) : (
                      <span class={{ "text-amber-300": r.edited }}>{r.units}</span>
                    )}
                  </td>
                  <td class="px-3 py-1.5">{money(r.price)}</td>
                  <td class="px-3 py-1.5 font-mono text-emerald-300">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="flex items-center justify-between bg-slate-900 px-3 py-2 text-sm text-slate-400">
            <button type="button" disabled={page === 0} onclick={() => (page = page - 1)} class="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40">
              ← Prev
            </button>
            <span>Page {page + 1} of {pages}</span>
            <button type="button" disabled={page >= pages - 1} onclick={() => (page = page + 1)} class="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>

        <aside class="space-y-3">
          <h3 class="text-sm font-bold uppercase tracking-wide text-indigo-400">Revenue by region</h3>
          <BarChart totals={totals} active={region} onpick={(name) => setRegion(region === name ? "all" : name)} />
          <p class="text-sm text-slate-400">
            Total: <span class="font-mono text-emerald-300">{money(revenue)}</span>
          </p>
        </aside>
      </div>

      {props.children}
    </div>
  );
}
