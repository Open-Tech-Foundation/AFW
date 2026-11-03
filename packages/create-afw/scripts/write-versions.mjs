// Release build step: record the sibling AFW packages' versions in versions.json, so
// the published scaffolder creates projects on the versions released with it.
import { readFile, writeFile } from "node:fs/promises";

import { AFW_PACKAGES } from "../versions.js";

const versions = {};
for (const [name, folder] of Object.entries(AFW_PACKAGES)) {
  const manifest = JSON.parse(await readFile(new URL(`../../${folder}/package.json`, import.meta.url), "utf8"));
  versions[name] = `^${manifest.version}`;
}
await writeFile(new URL("../versions.json", import.meta.url), `${JSON.stringify(versions, null, 2)}\n`);
console.log("versions.json:", versions);
