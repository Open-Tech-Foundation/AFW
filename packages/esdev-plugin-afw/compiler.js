// Compiler service for the AFW esdev plugins: locate the `afwc` binary and start
// its long-lived `afw serve` child. The protocol and resolution rules live in
// `@opentf/afw-build`; this module supplies the ES-Runtime host.
//
// Everything here runs on `esdev` (`runtime:*` only — no `node:` builtins, no
// napi), which is what lets a framework dev server stop being a Node program.

import { dirname, fromFileURL } from "runtime:path";
import { env, exit } from "runtime:process";

import {
  closeCompilers,
  compileError,
  ensureCompiler,
  findUp,
  resolveCompiler as resolveWith,
  startCompilerServer as startWith,
} from "@opentf/afw-build";
import { afwcPath } from "@opentf/afw-compiler";

import { esdevHost } from "./host.js";

export { closeCompilers, compileError };

/**
 * Resolve the compiler binary (`AFWC_BIN`, the prebuilt package, or a cargo build
 * in a source checkout). A failure prints the reason and exits, as a CLI should.
 */
export async function resolveCompiler({
  cliDir = dirname(fromFileURL(import.meta.url)),
  env: environment = env,
  resolvePackagedCompiler = afwcPath,
  findWorkspace = (name, from) => findUp(esdevHost, name, from),
  ensure = (afwc, workspace) => ensureCompiler(esdevHost, afwc, workspace),
} = {}) {
  try {
    return await resolveWith(esdevHost, { cliDir, env: environment, resolvePackagedCompiler, findWorkspace, ensure });
  } catch (e) {
    console.error(`✗ ${e?.message ?? e}`);
    exit(1);
  }
}

/** Start an `afwc serve` child on ES-Runtime (see `@opentf/afw-build`). */
export function startCompilerServer(afwc, { sourceMap = false } = {}) {
  return startWith(afwc, { sourceMap, spawn: esdevHost.spawn });
}
