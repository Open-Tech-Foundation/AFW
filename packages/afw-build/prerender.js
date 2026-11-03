// Static generation, shared by every toolchain: render each route of a built server
// bundle to `index.html` files (plus `__data.json` for loader routes), a `404.html`,
// and `sitemap.xml` / `robots.txt`. Each page is rendered by `renderDocument`, the
// same function a request server uses.

import { DATA_FILE, escapeXml, i18nSettings, localizePath, modulepreloadTags, renderDocument, renderNotFound } from "./document.js";

// "/" → <out>/index.html, "/post/1" → <out>/post/1/index.html.
function htmlPathFor(host, outDir, route) {
  return route === "/" ? host.path.join(outDir, "index.html") : host.path.join(outDir, route, "index.html");
}

function absoluteUrl(baseUrl, path) {
  if (!baseUrl) return "";
  return baseUrl.replace(/\/+$/, "") + (path === "/" ? "/" : path);
}

/** `sitemap.xml` for the rendered paths, with `<lastmod>` where known. */
export function sitemapXml(baseUrl, paths, lastUpdated = {}) {
  const urls = paths
    .map((p) => {
      const lastmod = lastUpdated[p] ? `<lastmod>${escapeXml(lastUpdated[p])}</lastmod>` : "";
      return `  <url><loc>${escapeXml(absoluteUrl(baseUrl, p))}</loc>${lastmod}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** A permissive `robots.txt`, pointing at the sitemap when there is one. */
export function robotsTxt(baseUrl, hasSitemap) {
  let body = "User-agent: *\nAllow: /\n";
  if (baseUrl && hasSitemap) body += `Sitemap: ${absoluteUrl(baseUrl, "/sitemap.xml")}\n`;
  return body;
}

/**
 * Pre-render the app into `outDir`.
 *
 * `render` is the server bundle's render API (`renderRoute`, `renderHead`,
 * `collectRoutePaths`, `resolveMetadata`). `shellHtml` is the client's `index.html`
 * (marked for hydration by the caller when the client hydrates). `loaders` is the
 * loader registry, run at build time with no request and an empty query. A
 * `public/sitemap.xml` or `public/robots.txt` in `publicDir` wins over the generated one.
 *
 * @returns {Promise<{ count: number, skipped: string[], failed: string[], siteDescription: string, paths: string[] }>}
 *   `siteDescription` is the site's own description (home route, else the root
 *   layout's metadata) for summaries such as `llms.txt`.
 */
export async function prerender(host, {
  render, shellHtml, outDir, publicDir, baseUrl = "", lastUpdated = {}, i18n = null, loaders = null,
  chunkManifest = null, onRender,
}) {
  const settings = i18nSettings(i18n);
  const locales = settings ? settings.locales : [null];
  const defaultLocale = settings?.defaultLocale ?? null;
  const { paths, skipped } = await render.collectRoutePaths();
  const preloadFor = (route) => modulepreloadTags(chunkManifest?.routes?.[route]);

  const failed = [];
  const rendered = [];
  let count = 0;
  let siteDescription = "";
  for (const { path, params, route } of paths) {
    onRender?.(++count, paths.length);
    for (const locale of locales) {
      const url = localizePath(path, locale, defaultLocale);
      try {
        const doc = await renderDocument(render, {
          shell: shellHtml, url, params, loaders, baseUrl, i18n, notFound: "throw",
          preload: preloadFor(route), modifiedTime: lastUpdated[path] ?? null,
        });
        if (path === "/" && (!locale || locale === defaultLocale) && typeof doc?.metadata?.description === "string") {
          siteDescription = doc.metadata.description;
        }
        // Static hosts decode requested URLs when locating files. Decode generated
        // segments once; leave literal static folder names unchanged.
        const outputPath = Object.keys(params ?? {}).length ? url.split("/").map(decodeURIComponent).join("/") : url;
        const file = htmlPathFor(host, outDir, outputPath);
        await host.writeText(file, doc?.html ?? shellHtml);
        // The static data file SPA navigation fetches on a plain static host —
        // byte-identical to the inline payload ("null" for an undefined result).
        if (doc?.loaded) await host.writeText(host.path.join(host.path.dirname(file), DATA_FILE), doc.dataJson || "null");
        rendered.push(url);
      } catch (e) {
        failed.push(url);
        const why = e?.afwNotFound ? "loader called notFound()" : (e?.message ?? e);
        console.error(`✗ pre-render failed for ${url}: ${why}`);
      }
    }
  }

  // Any unmatched path is served the 404 page by static hosts.
  try {
    const notFound = await renderNotFound(render, { shell: shellHtml, baseUrl, preload: modulepreloadTags(chunkManifest?.notFound) });
    if (notFound) await host.writeText(host.path.join(outDir, "404.html"), notFound.html);
  } catch {
    /* no 404 page */
  }

  let hasSitemap = false;
  if (!(await host.kind(host.path.join(publicDir, "sitemap.xml")))) {
    if (baseUrl) {
      await host.writeText(host.path.join(outDir, "sitemap.xml"), sitemapXml(baseUrl, rendered, lastUpdated));
      hasSitemap = true;
    } else {
      console.warn("⚠ sitemap.xml skipped: no site URL (set a base URL)");
    }
  }
  if (!(await host.kind(host.path.join(publicDir, "robots.txt")))) {
    await host.writeText(host.path.join(outDir, "robots.txt"), robotsTxt(baseUrl, hasSitemap));
  }

  // No "/" route (or it declared no description): fall back to the layout chain's
  // route-independent metadata — the site-wide description every route inherits.
  if (!siteDescription) {
    try {
      const siteMeta = await render.resolveMetadata({ route: "/", entry: null });
      if (typeof siteMeta?.description === "string") siteDescription = siteMeta.description;
    } catch {
      /* no root layout metadata */
    }
  }
  return { count: rendered.length, skipped, failed, siteDescription, paths: rendered };
}
