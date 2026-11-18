// "Last updated" resolution for a page file. Two sources only (build time):
//
//   1. A frontmatter override — `lastUpdated: 2026-06-25` (any Date-parseable value)
//      pins the date; `lastUpdated: false` hides it for that page.
//   2. The file's last git commit (committer date, `git log -1 --format=%cI`).
//
// No file-mtime fallback: mtime is noise (a checkout/copy bumps it), so when the file
// isn't in git history the value is simply null and the UI omits it. This runs in dev
// and build alike — the displayed time is always the real last content change.

import { dirname, join, runOut } from "./host.js";

/** Last git commit (committer ISO-8601) that touched `file`, or null. */
export async function gitLastUpdated(file) {
  // Empty output = untracked / no history (e.g. a shallow CI clone); null = not a
  // git repo, or git unavailable. Both mean "omit", so both collapse to null.
  const out = await runOut("git", ["log", "-1", "--format=%cI", "--", file], dirname(file));
  return out || null;
}

/**
 * The last commit (committer ISO-8601) of every file under `dir`, from one `git log`:
 * `Map<path, ISO>`, each path `join(dir, <its path under dir>)`. History is read newest
 * first, so a file's first sighting is its last commit, the one `gitLastUpdated` names.
 * Empty when `dir` is not in a git repository or git is unavailable.
 */
export async function gitLastUpdatedAll(dir) {
  // `-z`: paths as written, each NUL-terminated; `--relative`: under `dir`. Every commit
  // opens with \x01<date>.
  const out = await runOut("git", ["log", "-z", "--relative", "--name-only", "--format=%x01%cI", "--", "."], dir);
  const dates = new Map();
  let date = null;
  for (const token of (out ?? "").split("\0")) {
    const field = token.replace(/^\n/, "");
    if (field.startsWith("\x01")) date = field.slice(1);
    else if (field && date) {
      const file = join(dir, field);
      if (!dates.has(file)) dates.set(file, date);
    }
  }
  return dates;
}

/** Normalize a frontmatter override to ISO-8601, or keep the raw string if unparseable. */
function normalize(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/**
 * Resolve a page's last-updated timestamp.
 *
 * @param {string} file            Absolute path to the page file.
 * @param {*}      [frontmatter]   The frontmatter `lastUpdated` value, if any.
 * @param {(file: string) => Promise<string|null>} [gitDate] The file's git date; by default
 *   its own `git log` (a page scan passes a lookup into `gitLastUpdatedAll`).
 * @returns {string|null} ISO-8601 (or a raw override string), or null to omit.
 */
export async function resolveLastUpdated(file, frontmatter, gitDate = gitLastUpdated) {
  if (frontmatter === false) return null; // explicit opt-out for this page
  if (frontmatter != null && frontmatter !== true) return normalize(frontmatter);
  return gitDate(file);
}
