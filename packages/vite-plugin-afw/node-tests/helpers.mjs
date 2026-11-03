// Shared helpers for the Vite plugin's Node tests.
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
export const fixture = (name) => join(pkg, "node-tests", "fixtures", name);

/** A writable copy of a fixture inside the package, so `@opentf/*` resolve from its
 *  node_modules exactly as they do for an installed app. */
export async function copyFixture(name) {
  await mkdir(join(pkg, ".cache"), { recursive: true });
  const dir = await mkdtemp(join(pkg, ".cache", `${name}-`));
  await cp(fixture(name), dir, { recursive: true });
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
