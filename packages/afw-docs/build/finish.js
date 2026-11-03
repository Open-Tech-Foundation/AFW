// The steps a docs or blog site runs after its pages are prerendered: the AFW Search
// index, RSS and Atom feeds (advertised from every page), and `llms.txt`. Shared by
// both workflows through the installed host (host.js). Each step reads the project's
// afw.config (`docs`, `blog`, `site.url`) and honours a hand-written file in
// `public/`.

import { exists, join, readEntries, readText, writeText } from "./host.js";
import { loadPosts } from "./blog-posts-plugin.js";
import { postContentHtml, renderAtomFeed, renderBlogFeed } from "./feed.js";
import { readFrontmatter } from "./frontmatter.js";
import { renderLlmsFullTxt, renderLlmsTxt } from "./llms.js";
import { isUnpublished } from "./publish.js";
import { indexWithAfwSearch } from "./search.js";

/** Whether "last updated" tracking is enabled anywhere (`docs`/`blog` `lastUpdated`). */
export function wantsLastUpdated(config) {
  return Boolean(config?.docs?.lastUpdated || config?.blog?.lastUpdated);
}

/** The blog's content folder under `app/`, or undefined without a blog. */
export function blogDir(config) {
  return config?.blog ? config.blog.dir ?? "blog" : undefined;
}

/**
 * The warning for a `docs.search.provider` other than `"afw"`, or null. A retired value
 * would otherwise turn search off without a word.
 */
export function searchProviderWarning(config) {
  const provider = config?.docs?.search?.provider;
  if (provider == null || provider === "afw") return null;
  return `⚠ docs.search.provider ${JSON.stringify(provider)} is not supported; use "afw" or remove it. Search is disabled for this build.`;
}

/** Index the prerendered site when static search is on. Errors fail the build. */
export async function runDocsSearchIndex(config, siteDir, afwc) {
  if (config?.docs?.search?.provider !== "afw") return null;
  return indexWithAfwSearch({ siteDir, afwc });
}

/**
 * Write `<blog>/rss.xml` and `<blog>/atom.xml` with each post's full content, read back
 * from its prerendered page, and link them from every page's `<head>`. Needs the site
 * URL. Returns `{ paths, urls, count }`, or null when skipped.
 */
export async function runBlogFeed({ root, appDir, config, siteDir, baseUrl, exclude = new Set() }) {
  const blog = config?.blog;
  if (!blog) return null;
  if (!baseUrl) {
    console.warn("⚠ blog feeds skipped: no site URL (set site.url in afw.config)");
    return null;
  }
  const contentDir = blog.dir ?? "blog";
  const posts = await loadPosts({ appDir, contentDir, exclude });
  for (const post of posts) {
    const page = join(siteDir, post.path.replace(/^\/+/, ""), "index.html");
    if (await exists(page)) post.content = postContentHtml(await readText(page), baseUrl, post.cover);
  }
  const title = blog.title || (config?.docs?.title ? `${config.docs.title} Blog` : "Blog");
  const channel = {
    title,
    description: blog.description || title,
    link: `/${contentDir}`,
    language: blog.language || config?.i18n?.defaultLocale || "en",
  };
  const feeds = [
    { file: "rss.xml", path: `/${contentDir}/rss.xml`, render: renderBlogFeed },
    { file: "atom.xml", path: `/${contentDir}/atom.xml`, render: renderAtomFeed },
  ];
  const written = [];
  for (const feed of feeds) {
    if (await exists(join(root, "public", contentDir, feed.file))) continue; // honour an override
    await writeText(join(siteDir, contentDir, feed.file), feed.render({ posts, baseUrl, feedPath: feed.path, channel }));
    written.push(feed.path);
  }
  if (!written.length) return null;
  await injectFeedLinks(siteDir, title, contentDir);
  const origin = baseUrl.replace(/\/+$/, "");
  return { paths: written, urls: written.map((path) => origin + path), count: posts.length };
}

/**
 * Advertise the feeds from every prerendered page: RSS and Atom `<link rel="alternate">`
 * in each `<head>`. A page that already declares a feed is left alone.
 */
async function injectFeedLinks(siteDir, title, contentDir) {
  const t = String(title).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const links =
    `<link rel="alternate" type="application/rss+xml" title="${t}" href="/${contentDir}/rss.xml">\n` +
    `<link rel="alternate" type="application/atom+xml" title="${t}" href="/${contentDir}/atom.xml">\n`;
  const walk = async (dir) => {
    for (const entry of await readEntries(dir)) {
      const full = join(dir, entry.name);
      if (entry.isDir) await walk(full);
      else if (entry.name.endsWith(".html")) {
        const html = await readText(full);
        if (/type="application\/(rss|atom)\+xml"/.test(html) || !/<\/head>/i.test(html)) continue;
        await writeText(full, html.replace(/<\/head>/i, () => `${links}</head>`));
      }
    }
  };
  await walk(siteDir);
}

/** The app's published page, layout and 404 files (what `llms.txt` summarizes). */
export async function publishedPages(appDir, exclude = new Set()) {
  const out = [];
  const walk = async (dir) => {
    for (const entry of await readEntries(dir)) {
      if (entry.isDir) {
        if (!exclude.has(entry.name) && !entry.name.startsWith(".") && entry.name !== "node_modules") await walk(join(dir, entry.name));
        continue;
      }
      if (!/^(page|layout|404)\.(mdx|md|[jt]sx)$/.test(entry.name)) continue;
      const file = join(dir, entry.name);
      if (/\.(mdx|md)$/.test(entry.name) && isUnpublished(await readFrontmatter(file))) continue;
      out.push(file);
    }
  };
  await walk(appDir);
  return out.sort();
}

/**
 * Write `/llms.txt` and `/llms-full.txt` for a docs or blog site. A file in `public/`
 * overrides each one. `siteDescription` summarizes the site (from its own metadata).
 */
export async function runLlmsFiles({ root, appDir, pages, config, siteDir, baseUrl, siteDescription = "" }) {
  if (!config?.docs && !config?.blog) return null;
  const outputs = [
    { file: "llms.txt", render: renderLlmsTxt },
    { file: "llms-full.txt", render: renderLlmsFullTxt },
  ];
  const written = [];
  for (const out of outputs) {
    if (await exists(join(root, "public", out.file))) continue;
    await writeText(join(siteDir, out.file), await out.render({ appDir, pages, baseUrl, config, siteDescription }));
    written.push(`/${out.file}`);
  }
  return written.length ? { paths: written } : null;
}

/**
 * Every finishing step, in order, for a prerendered site in `siteDir`. Returns what
 * each step produced (null for a skipped step).
 */
export async function finishSite({ root, appDir, config, siteDir, baseUrl = "", exclude = new Set(), siteDescription = "", afwc }) {
  const warning = searchProviderWarning(config);
  if (warning) console.warn(warning);
  // A failed search index fails the build; feeds and llms.txt warn and carry on.
  const search = await runDocsSearchIndex(config, siteDir, afwc);
  const optional = async (label, step) => {
    try {
      return await step();
    } catch (e) {
      console.warn(`⚠ ${label} skipped: ${e?.message ?? e}`);
      return null;
    }
  };
  const feeds = await optional("blog feeds", () => runBlogFeed({ root, appDir, config, siteDir, baseUrl, exclude }));
  const llms = await optional("llms.txt", async () =>
    runLlmsFiles({ root, appDir, pages: await publishedPages(appDir, exclude), config, siteDir, baseUrl, siteDescription }));
  return { search, feeds, llms };
}
