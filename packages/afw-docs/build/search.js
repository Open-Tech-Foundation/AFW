// Build-time AFW Search indexing; called after prerendering by the finish plugin.

import { join } from "runtime:path";
import { Command } from "runtime:system";
import { afwcPath } from "@opentf/afw-compiler";

/**
 * Build the index from prerendered HTML using the unified native toolchain.
 * Published toolchains ship one afwc binary; source checkouts build it
 * from `cargo build -p afw_cli`.
 */
export async function indexWithAfwSearch({ siteDir, afwc }) {
  const binary = afwc || await afwcPath();
  const out = new Command(binary, {
    args: ["docs", "index", siteDir, "--out", join(siteDir, "_search"), "--root", "main"],
    stdout: "piped",
    stderr: "piped",
    inheritEnv: true,
  });
  const result = await out.output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr).trim() || "afwc docs index failed");
  const message = new TextDecoder().decode(result.stderr);
  const indexed = /indexed\s+(\d+)\s+page/.exec(message);
  if (!indexed) throw new Error("afwc docs index did not report an index. Install the updated @opentf/afw-compiler containing the docs indexing command.");
  const pages = Number(indexed[1]);
  return { pages };
}
