// Small shared formatting helpers for the docs/blog components.

const DATE_OPTIONS = { year: "numeric", month: "long", day: "numeric" };

// `2026-06-24` (or any Temporal-parseable value) → `June 24, 2026`. Date-only
// values are calendar dates, not instants, so no time zone can shift them to
// another day; timestamps with an offset render in the viewer's zone. Anything
// Temporal can't parse falls back to the raw value so it still renders.
export function formatDate(value) {
  if (!value) return "";
  try {
    if (typeof value === "number") {
      return localInstant(value).toLocaleString("en-US", DATE_OPTIONS);
    }
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return Temporal.PlainDate.from(text).toLocaleString("en-US", DATE_OPTIONS);
    }
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
      return Temporal.Instant.from(text)
        .toZonedDateTimeISO(Temporal.Now.timeZoneId())
        .toLocaleString("en-US", DATE_OPTIONS);
    }
    // A local date-time has no instant to convert.
    return Temporal.PlainDateTime.from(text).toLocaleString("en-US", DATE_OPTIONS);
  } catch {
    return String(value);
  }
}

function localInstant(ms) {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId());
}
