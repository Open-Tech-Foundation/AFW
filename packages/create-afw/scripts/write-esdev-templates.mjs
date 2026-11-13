// Write the esdev starters (esdev/templates) from templates.js, the source both
// scaffolders share. Run by `build`; the output is published, never edited by hand.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESDEV_TEMPLATES, esdevCatalog, esdevTemplate } from "../esdev-templates.js";

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), "esdev", "templates");
await rm(out, { recursive: true, force: true });
for (const name of Object.keys(ESDEV_TEMPLATES)) {
  for (const [path, contents] of Object.entries(esdevTemplate(name))) {
    const file = join(out, name, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
}
await writeFile(join(out, "catalog.json"), esdevCatalog());
console.log(`esdev templates → ${out}`);
