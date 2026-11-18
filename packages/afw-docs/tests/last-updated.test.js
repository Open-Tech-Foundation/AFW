// `lastUpdatedPlugin` / `loadLastUpdated` read each page's last git commit. Projects
// configure `appDir` as a relative path ("app"), and the dates must match whether the
// map comes from the browser build's virtual module or the prerender's direct call.

import { afterAll, beforeAll, describe, expect, test } from "runtime:test";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { join, relative } from "runtime:path";
import { cwd } from "runtime:process";
import { Command } from "runtime:system";

import { lastUpdatedPlugin, loadLastUpdated } from "../build/index.js";

let project;
let appDir;

async function git(args, date) {
  const env = date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {};
  const out = await new Command("git", {
    args: ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    cwd: project, env, inheritEnv: true, stdout: "null", stderr: "piped",
  }).output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
}

async function page(path, body) {
  await mkdir(join(appDir, path), { recursive: true });
  await write(join(appDir, path, "page.mdx"), body);
}

async function moduleMap(dir) {
  const plugin = lastUpdatedPlugin({ appDir: dir });
  const { code } = await plugin.load.handler("afw-virtual:afw-last-updated");
  return JSON.parse(code.match(/^export default (.*);$/m)[1]);
}

beforeAll(async () => {
  await mkdir(join(cwd(), ".cache"), { recursive: true });
  project = await makeTempDir({ dir: join(cwd(), ".cache"), prefix: "last-updated-" });
  appDir = join(project, "app");
  await git(["init", "-q"]);
  await page("docs", "# Docs\n");
  await page("docs/guide", "---\nlastUpdated: 2026-01-15\n---\n# Guide\n");
  await page("docs/hidden", "---\nlastUpdated: false\n---\n# Hidden\n");
  await page("blog/edited", "---\ndate: 2026-01-01\nupdated: 2026-02-10\n---\n# Edited\n");
  await page("blog/untouched", "---\ndate: 2026-01-01\n---\n# Untouched\n");
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "pages"], "2026-03-01T10:00:00+05:30");
  // A later commit touching one page, under a name git quotes unless asked not to.
  await page("docs/(guides)/über uns", "# Über uns\n");
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "about"], "2026-03-05T09:00:00+00:00");
  await write(join(appDir, "docs/(guides)/über uns/page.mdx"), "# Über uns, edited\n");
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "edit about"], "2026-04-02T08:30:00+05:30");
  await page("docs/draft", "# Untracked\n");
});

afterAll(async () => {
  await remove(project, { recursive: true });
});

describe("last-updated map", () => {
  test("a relative appDir resolves git dates like an absolute one", async () => {
    const relativeDir = relative(cwd(), appDir);
    expect(relativeDir.startsWith("/")).toBe(false);
    const fromRelative = await moduleMap(relativeDir);
    const fromAbsolute = await moduleMap(appDir);
    expect(fromRelative["/docs"]).toBe("2026-03-01T10:00:00+05:30");
    expect(fromRelative).toEqual(fromAbsolute);
  });

  test("the prerender's direct call matches the browser module", async () => {
    const relativeDir = relative(cwd(), appDir);
    expect(await loadLastUpdated({ appDir: relativeDir })).toEqual(await moduleMap(relativeDir));
  });

  test("frontmatter overrides git, false hides the page, untracked pages are omitted", async () => {
    const map = await moduleMap(relative(cwd(), appDir));
    expect(map["/docs/guide"]).toBe("2026-01-15T00:00:00.000Z");
    expect("/docs/hidden" in map).toBe(false);
    expect("/docs/draft" in map).toBe(false);
  });

  test("blog posts take `updated` from frontmatter only, never from git", async () => {
    const map = await loadLastUpdated({ appDir, blogDir: "blog" });
    expect(map["/blog/edited"]).toBe("2026-02-10T00:00:00.000Z");
    // Committed with the rest, but a commit is not an edit the author dated.
    expect("/blog/untouched" in map).toBe(false);
    expect(map["/docs"]).toBe("2026-03-01T10:00:00+05:30");
    // Without `blogDir` the post is an ordinary page and git applies.
    expect((await loadLastUpdated({ appDir }))["/blog/untouched"]).toBe("2026-03-01T10:00:00+05:30");
  });

  test("each page has its own last commit, read from one log of the whole folder", async () => {
    const map = await loadLastUpdated({ appDir });
    // Committed twice, newest wins; the pages around it keep the first commit.
    expect(map["/docs/über uns"]).toBe("2026-04-02T08:30:00+05:30");
    expect(map["/docs"]).toBe("2026-03-01T10:00:00+05:30");
    expect(map["/blog/untouched"]).toBe("2026-03-01T10:00:00+05:30");
  });

  test("a folder outside any git repository has no git dates", async () => {
    const outside = await makeTempDir({ prefix: "last-updated-nogit-" });
    try {
      await mkdir(join(outside, "docs"), { recursive: true });
      await write(join(outside, "docs", "page.mdx"), "# Docs\n");
      await write(join(outside, "page.mdx"), "---\nlastUpdated: 2026-05-01\n---\n# Home\n");
      expect(await loadLastUpdated({ appDir: outside })).toEqual({ "/": "2026-05-01T00:00:00.000Z" });
    } finally {
      await remove(outside, { recursive: true });
    }
  });

  test("edit paths are repository-relative", async () => {
    const plugin = lastUpdatedPlugin({ appDir: relative(cwd(), appDir) });
    const { code } = await plugin.load.handler("afw-virtual:afw-last-updated");
    const editPaths = JSON.parse(code.match(/^export const editPaths = (.*);$/m)[1]);
    expect(editPaths["/docs"]).toBe("app/docs/page.mdx");
  });
});
