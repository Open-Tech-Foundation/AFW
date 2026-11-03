// Locate the `afwc` binary: `AFWC_BIN`, else the prebuilt binary from
// `@opentf/afw-compiler`, else — in a source checkout of this repository — the cargo
// build, compiled on demand. Failures throw; the toolchain decides how to report them.

/** Nearest ancestor directory of `from` (inclusive) that contains `name`. */
export async function findUp(host, name, from) {
  let dir = from;
  for (;;) {
    if (await host.kind(host.path.join(dir, name))) return dir;
    const parent = host.path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function hasLocalCompilerWorkspace(host, workspace) {
  return !!workspace && (await host.kind(host.path.join(workspace, "crates", "afw_cli", "Cargo.toml"))) === "file";
}

/** Build `afwc` from the source checkout at `workspace` unless it already exists. */
export async function ensureCompiler(host, afwc, workspace) {
  if (await host.kind(afwc)) return;
  if (!workspace) throw new Error(`afwc compiler not found at ${afwc}`);
  console.log("building compiler (cargo build -p afw_cli)…");
  const cargo = await host.run("cargo", ["--version"], { cwd: workspace });
  if (!cargo.ok) {
    throw new Error(
      `cannot build afwc because cargo is not available.\n` +
        `  This source checkout needs Rust/Cargo to build ${afwc}.\n` +
        `  Install Rust in the build environment, set AFWC_BIN to an existing afwc binary,\n` +
        `  or install the published packages so @opentf/afw-compiler can use its prebuilt binary.`,
    );
  }
  const built = await host.run("cargo", ["build", "-p", "afw_cli"], { cwd: workspace, inherit: true });
  if (!built.ok) throw new Error(`cargo build -p afw_cli failed (exit ${built.code ?? "unknown"})`);
}

/**
 * Resolve the compiler binary. `cliDir` is the calling package's directory: a copy
 * installed under `node_modules` never builds from source, a workspace checkout may.
 * `resolvePackagedCompiler` is the platform's `afwcPath` from `@opentf/afw-compiler`.
 * `findWorkspace` and `ensure` are injectable for tests.
 *
 * @returns {Promise<{ afwc: string, workspace: string | null }>}
 */
export async function resolveCompiler(host, {
  cliDir,
  env = host.env,
  resolvePackagedCompiler,
  findWorkspace = (name, from) => findUp(host, name, from),
  ensure = (afwc, workspace) => ensureCompiler(host, afwc, workspace),
} = {}) {
  if (env.AFWC_BIN) return { afwc: env.AFWC_BIN, workspace: null };

  let packagedError = null;
  try {
    if (typeof resolvePackagedCompiler !== "function") throw new Error("no packaged compiler resolver");
    return { afwc: await resolvePackagedCompiler(), workspace: null };
  } catch (e) {
    packagedError = e;
  }

  const installedPackage = !!cliDir && cliDir.split(/[\\/]/).includes("node_modules");
  const workspace = installedPackage || !cliDir ? null : await findWorkspace("Cargo.toml", cliDir);
  if (await hasLocalCompilerWorkspace(host, workspace)) {
    const afwc = host.path.join(workspace, "target", "debug", "afwc");
    await ensure(afwc, workspace);
    return { afwc, workspace };
  }

  throw new Error(
    `${packagedError?.message ?? "cannot resolve @opentf/afw-compiler prebuilt binary"}\n` +
      `  No local afwc compiler workspace was found to build from source.`,
  );
}
