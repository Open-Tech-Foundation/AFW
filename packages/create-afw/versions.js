// The AFW package versions a new project depends on, resolved so the scaffolder works
// however it was installed:
//
//   1. `versions.json` beside this file, when a release build wrote one;
//   2. the sibling workspace packages, inside the AFW repository;
//   3. the npm registry's `latest` for each package (`npm create` has just reached it);
//   4. the `latest` dist-tag, so scaffolding never fails on a lookup.

import { readFile } from "node:fs/promises";

import { timeoutRun } from "@opentf/std";

export const AFW_PACKAGES = {
  "@opentf/afw": "afw",
  "@opentf/afw-docs": "afw-docs",
  "@opentf/afw-test": "afw-test",
  "@opentf/vite-plugin-afw": "vite-plugin-afw",
};

const REGISTRY_TIMEOUT_MS = 5000;

async function fromFile() {
  return JSON.parse(await readFile(new URL("./versions.json", import.meta.url), "utf8"));
}

async function fromWorkspace() {
  const versions = {};
  for (const [name, folder] of Object.entries(AFW_PACKAGES)) {
    const manifest = JSON.parse(await readFile(new URL(`../${folder}/package.json`, import.meta.url), "utf8"));
    if (manifest.name !== name) throw new Error(`not the ${name} workspace package`);
    versions[name] = `^${manifest.version}`;
  }
  return versions;
}

/** `^<latest>` for each package from the npm registry (`npm_config_registry` honoured). */
export async function fromRegistry({ registry = process.env.npm_config_registry || "https://registry.npmjs.org/", fetch = globalThis.fetch } = {}) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  const entries = await Promise.all(Object.keys(AFW_PACKAGES).map(async (name) => {
    const res = await timeoutRun(() => fetch(`${base}${name}/latest`, { headers: { accept: "application/json" } }), REGISTRY_TIMEOUT_MS);
    if (!res.ok) throw new Error(`${name}: registry answered ${res.status}`);
    const { version } = await res.json();
    if (typeof version !== "string") throw new Error(`${name}: no version in the registry answer`);
    return [name, `^${version}`];
  }));
  return Object.fromEntries(entries);
}

export async function afwVersions(options = {}) {
  for (const source of [fromFile, fromWorkspace, () => fromRegistry(options)]) {
    try {
      return await source();
    } catch {
      // try the next source
    }
  }
  return Object.fromEntries(Object.keys(AFW_PACKAGES).map((name) => [name, "latest"]));
}
