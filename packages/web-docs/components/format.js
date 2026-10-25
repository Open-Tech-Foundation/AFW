// Small shared formatting helpers for the docs/blog components.

const DATE_OPTIONS = { year: "numeric", month: "long", day: "numeric" };

// `2026-06-24` (or any Date-parseable value) → `June 24, 2026`. Date-only values are
// calendar dates, not instants, so they format in UTC and no viewer time zone can
// shift them to another day; timestamps render in the viewer's zone. Anything the
// Date constructor can't parse falls back to the raw value so it still renders.
// Uses `Date` rather than Temporal, which Safari does not ship.
export function formatDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(`${value}T00:00:00Z`);
    // Some engines roll an impossible day over (2026-02-30 → March 2); keep it raw.
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return value;
    return day.toLocaleDateString("en-US", { ...DATE_OPTIONS, timeZone: "UTC" });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", DATE_OPTIONS);
}
