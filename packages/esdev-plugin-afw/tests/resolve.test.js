import { afterEach, describe, expect, test } from "runtime:test";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";

import { resolveCompiler } from "../index.js";

const HERE = dirname(fromFileURL(import.meta.url));
const tmpRoots = [];

/** A fresh workspace skeleton: a Cargo marker where the resolver looks for one. */
async function tmpWorkspace() {
  const root = await makeTempDir({ dir: HERE, prefix: "afw-compiler-resolution-" });
  await mkdir(join(root, "crates", "afw_cli"), { recursive: true });
  await write(join(root, "crates", "afw_cli", "Cargo.toml"), '[package]\nname = "afw_cli"\n');
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of tmpRoots.splice(0)) {
    try {
      await remove(root, { recursive: true });
    } catch {}
  }
});

describe("resolveCompiler", () => {
  test("uses AFWC_BIN before package or workspace resolution", async () => {
    const result = await resolveCompiler({
      env: { AFWC_BIN: "/custom/afwc" },
      resolvePackagedCompiler() {
        throw new Error("should not resolve package");
      },
      findWorkspace() {
        throw new Error("should not find workspace");
      },
    });

    expect(result).toEqual({ afwc: "/custom/afwc", workspace: null });
  });

  test("uses the packaged compiler before a local workspace", async () => {
    const workspace = await tmpWorkspace();
    let ensured = false;

    const result = await resolveCompiler({
      cliDir: join(workspace, "packages", "afw-cli", "src"),
      env: {},
      resolvePackagedCompiler: () => "/node_modules/@opentf/afw-compiler/bin/linux-x64/afwc",
      findWorkspace: () => workspace,
      ensure() {
        ensured = true;
      },
    });

    expect(result).toEqual({
      afwc: "/node_modules/@opentf/afw-compiler/bin/linux-x64/afwc",
      workspace: null,
    });
    expect(ensured).toBe(false);
  });

  test("falls back to the local compiler workspace when the package has no binary", async () => {
    const workspace = await tmpWorkspace();
    let ensured = null;

    const result = await resolveCompiler({
      cliDir: join(workspace, "packages", "afw-cli", "src"),
      env: {},
      resolvePackagedCompiler() {
        throw new Error("prebuilt missing");
      },
      findWorkspace: () => workspace,
      ensure(afwc, root) {
        ensured = { afwc, root };
      },
    });

    const afwc = join(workspace, "target", "debug", "afwc");
    expect(result).toEqual({ afwc, workspace });
    expect(ensured).toEqual({ afwc, root: workspace });
  });
});
