import { expect, test } from "runtime:test";
import { makeTempDir, remove, write } from "runtime:fs";
import { fromFileURL, join } from "runtime:path";
import { env } from "runtime:process";
import { Command } from "runtime:system";
import { formatDate } from "../components/format.js";

const formatModule = fromFileURL(new URL("../components/format.js", import.meta.url));

test("keeps a date-only value on its calendar day in a negative UTC offset", async () => {
  const dir = await makeTempDir({ dir: ".cache", prefix: "format-date-" });
  const probe = join(dir, "probe.mjs");
  await write(
    probe,
    `import { formatDate } from ${JSON.stringify(formatModule)};\n` +
      `console.log(formatDate("2026-06-24"));\n` +
      `console.log(formatDate("2026-06-24T02:00:00Z"));\n`,
  );
  try {
    const result = await new Command(env.ESDEV_BIN || "esdev", {
      args: [probe],
      inheritEnv: true,
      env: { TZ: "America/Los_Angeles" },
    }).output();
    if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
    const [dateOnly, instant] = new TextDecoder().decode(result.stdout).trim().split("\n");
    // A calendar date stays put; an instant still renders in local time.
    expect(dateOnly).toBe("June 24, 2026");
    expect(instant).toBe("June 23, 2026");
  } finally {
    await remove(dir, { recursive: true });
  }
});

test("falls back to the raw value when it is empty or not a date", () => {
  expect(formatDate("")).toBe("");
  expect(formatDate("not a date")).toBe("not a date");
});
