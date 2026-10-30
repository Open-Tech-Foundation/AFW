// Publication state of a Markdown page, from its frontmatter. One rule for every place
// that lists or emits pages (post list, feeds, docs nav), so a draft can't show up in one
// and not another.
//
// A page is unpublished when it has `draft: true`, or a `date` later than now (a
// scheduled post). Unpublished pages are shown by the dev server (`esdev start`) only.

/** True when the frontmatter marks the page as a draft or schedules it for later. */
export function isUnpublished(fm, now = Date.now()) {
  if (fm?.draft === true) return true;
  if (fm?.date == null) return false;
  const at = new Date(String(fm.date)).getTime();
  return !Number.isNaN(at) && at > now;
}

/**
 * Whether a build shows unpublished pages: only the dev server does. `ctx` is the esdev
 * hook context (its `command` is "start" under `esdev start`); an explicit `drafts`
 * option wins.
 */
export function showsUnpublished(drafts, ctx) {
  return drafts ?? ctx?.command === "start";
}

/** A post's "updated" date from frontmatter (`updated`, or the docs-style `lastUpdated`). */
export function frontmatterUpdated(fm) {
  const value = fm?.updated ?? fm?.lastUpdated;
  return value == null || value === true || value === false ? undefined : String(value);
}
