// Shared helpers for the docs package's Vite (Node) tests.
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const pkg = dirname(dirname(fileURLToPath(import.meta.url)));

/** A writable copy of the fixture site inside the package, so `@opentf/*` resolve
 *  from its node_modules as they do for an installed site. */
export async function copySite() {
  await mkdir(join(pkg, ".cache"), { recursive: true });
  const dir = await mkdtemp(join(pkg, ".cache", "site-"));
  await cp(join(pkg, "node-tests", "fixtures", "site"), dir, { recursive: true });
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
