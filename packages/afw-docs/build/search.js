// Build-time AFW Search indexing; called after prerendering by the finish plugin.

import { afwcPath, join, run } from "./host.js";

/**
 * Build the index from prerendered HTML using the unified native toolchain.
 * Published toolchains ship one afwc binary; source checkouts build it
 * from `cargo build -p afw_cli`.
 */
export async function indexWithAfwSearch({ siteDir, afwc }) {
  const binary = afwc || await afwcPath();
  const result = await run(binary, ["docs", "index", siteDir, "--out", join(siteDir, "_search"), "--root", "main"]);
  if (!result.ok) throw new Error(result.stderr.trim() || "afwc docs index failed");
  const message = result.stderr;
  const indexed = /indexed\s+(\d+)\s+page/.exec(message);
  if (!indexed) throw new Error("afwc docs index did not report an index. Install the updated @opentf/afw-compiler containing the docs indexing command.");
  const pages = Number(indexed[1]);
  return { pages };
}
