import { expect, test } from "runtime:test";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { fromFileURL, join } from "runtime:path";
import { env } from "runtime:process";
import { Command } from "runtime:system";
import { formatDate } from "../components/format.js";

const formatModule = fromFileURL(new URL("../components/format.js", import.meta.url));

// Run `formatDate` over `values` in a separate process with the given time zone.
// `prelude` runs first (e.g. to remove Temporal, as in Safari).
async function formatIn(timeZone, values, prelude = "") {
  await mkdir(".cache", { recursive: true });
  const dir = await makeTempDir({ dir: ".cache", prefix: "format-date-" });
  const probe = join(dir, "probe.mjs");
  await write(
    probe,
    `${prelude}\nconst { formatDate } = await import(${JSON.stringify(formatModule)});\n` +
      `console.log(JSON.stringify([${values.join(", ")}].map(formatDate)));\n`,
  );
  try {
    const result = await new Command(env.ESDEV_BIN || "esdev", {
      args: [probe],
      inheritEnv: true,
      env: { TZ: timeZone },
    }).output();
    if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
    return JSON.parse(new TextDecoder().decode(result.stdout).trim());
  } finally {
    await remove(dir, { recursive: true });
  }
}

test("keeps a date-only value on its calendar day on both sides of UTC", async () => {
  for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    const [dateOnly] = await formatIn(zone, ['"2026-06-24"']);
    expect(dateOnly).toBe("June 24, 2026");
  }
});

test("renders instants in the viewer's time zone", async () => {
  const [utc, offset, millis] = await formatIn("America/Los_Angeles", [
    '"2026-06-24T02:00:00Z"',
    '"2026-06-24T10:00:00+05:30"',
    "Date.UTC(2026, 5, 24, 2)",
  ]);
  expect(utc).toBe("June 23, 2026");
  expect(offset).toBe("June 23, 2026");
  expect(millis).toBe("June 23, 2026");
});

test("formats Date objects", async () => {
  const [date] = await formatIn("America/Los_Angeles", ['new Date("2026-06-24T12:00:00Z")']);
  expect(date).toBe("June 24, 2026");
});

test("works without Temporal", async () => {
  const values = ['"2026-06-24"', '"2026-06-24T12:00:00Z"', 'new Date("2026-06-24T12:00:00Z")'];
  const formatted = await formatIn("America/Los_Angeles", values, "delete globalThis.Temporal;");
  expect(formatted).toEqual(["June 24, 2026", "June 24, 2026", "June 24, 2026"]);
});

test("falls back to the raw value when it is empty or not a date", () => {
  expect(formatDate("")).toBe("");
  expect(formatDate(null)).toBe("");
  expect(formatDate("not a date")).toBe("not a date");
  expect(formatDate("2026-02-30")).toBe("2026-02-30");
});
