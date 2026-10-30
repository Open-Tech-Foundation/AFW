// The one publication rule every listing shares: drafts and future-dated pages are
// unpublished, and only the dev server shows them.

import { describe, expect, test } from "runtime:test";

import { frontmatterUpdated, isUnpublished, showsUnpublished } from "../build/publish.js";

const NOW = Date.parse("2026-10-30T12:00:00Z");

describe("isUnpublished", () => {
  test("a draft is unpublished whatever its date", () => {
    expect(isUnpublished({ draft: true, date: "2026-01-01" }, NOW)).toBe(true);
    expect(isUnpublished({ draft: false, date: "2026-01-01" }, NOW)).toBe(false);
  });

  test("a future date schedules the page; today and the past are live", () => {
    expect(isUnpublished({ date: "2026-11-01" }, NOW)).toBe(true);
    expect(isUnpublished({ date: "2026-10-30" }, NOW)).toBe(false);
    expect(isUnpublished({ date: "2026-01-01" }, NOW)).toBe(false);
  });

  test("no date, or one that doesn't parse, never hides a page", () => {
    expect(isUnpublished({}, NOW)).toBe(false);
    expect(isUnpublished({ date: "someday" }, NOW)).toBe(false);
    expect(isUnpublished(undefined, NOW)).toBe(false);
  });
});

describe("showsUnpublished", () => {
  test("only `esdev start` shows them, unless the option says otherwise", () => {
    expect(showsUnpublished(undefined, { command: "start" })).toBe(true);
    expect(showsUnpublished(undefined, { command: "build" })).toBe(false);
    expect(showsUnpublished(undefined, undefined)).toBe(false);
    expect(showsUnpublished(true, { command: "build" })).toBe(true);
    expect(showsUnpublished(false, { command: "start" })).toBe(false);
  });
});

describe("frontmatterUpdated", () => {
  test("reads `updated`, then `lastUpdated`, and ignores booleans", () => {
    expect(frontmatterUpdated({ updated: "2026-02-01", lastUpdated: "2026-01-01" })).toBe("2026-02-01");
    expect(frontmatterUpdated({ lastUpdated: "2026-01-01" })).toBe("2026-01-01");
    expect(frontmatterUpdated({ lastUpdated: false })).toBe(undefined);
    expect(frontmatterUpdated({})).toBe(undefined);
  });
});
