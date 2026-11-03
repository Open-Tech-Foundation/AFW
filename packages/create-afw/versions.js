// The AFW package versions a new project depends on: the ones this scaffolder was
// released with (`versions.json`, written by `npm run build`), or — in the AFW
// repository itself — the workspace packages' current versions.

import { readFile } from "node:fs/promises";

export const AFW_PACKAGES = { "@opentf/afw": "afw", "@opentf/afw-test": "afw-test", "@opentf/vite-plugin-afw": "vite-plugin-afw" };

export async function afwVersions() {
  try {
    return JSON.parse(await readFile(new URL("./versions.json", import.meta.url), "utf8"));
  } catch {
    const versions = {};
    for (const [name, folder] of Object.entries(AFW_PACKAGES)) {
      const manifest = JSON.parse(await readFile(new URL(`../${folder}/package.json`, import.meta.url), "utf8"));
      versions[name] = `^${manifest.version}`;
    }
    return versions;
  }
}
