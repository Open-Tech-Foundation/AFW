// Search, region filter and counts for the data explorer. Callback props report
// changes to the parent, which owns the state.

export default function Toolbar(props) {
  return (
    <div class="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder="Search products…"
        value={props.query}
        oninput={(e) => props.onquery?.(e.currentTarget.value)}
        class="w-56 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <select
        value={props.region}
        onchange={(e) => props.onregion?.(e.currentTarget.value)}
        class="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
      >
        <option value="all">All regions</option>
        {props.regions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button
        type="button"
        onclick={() => props.onreload?.()}
        class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
      >
        Reload data
      </button>
      <span class="ml-auto text-sm text-slate-400">
        {props.shown} of {props.total} rows
      </span>
    </div>
  );
}
