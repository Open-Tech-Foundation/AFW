//! Resolve the `afwc` binary from Node — the Vite workflow's twin of extract.js.
//
// Same layout and rules as the ES-Runtime resolver: one brotli-compressed binary per
// platform under `bin/<platform>-<arch>/afwc[.exe].br`, decompressed on first use and
// renamed into place so a concurrent first use never sees a half-written file.
// Node reports hosts with the same names the `bin/` folders use.

import { randomUUID } from "node:crypto";
import { access, chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompress } from "node:zlib";
import { promisify } from "node:util";

const decompressBrotli = promisify(brotliDecompress);
const here = dirname(fileURLToPath(import.meta.url));

const SUPPORTED = new Set(["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"]);

const exists = (path) => access(path).then(() => true, () => false);

function hostBinPath({ binaryDir = here, os = process.platform, cpuArch = process.arch } = {}) {
  const key = `${os}-${cpuArch}`;
  if (!SUPPORTED.has(key)) return null;
  return join(binaryDir, "bin", key, os === "win32" ? "afwc.exe" : "afwc");
}

const pending = new Map();

function decompress(out, os) {
  let job = pending.get(out);
  if (!job) {
    job = decompressOnce(out, os).finally(() => pending.delete(out));
    pending.set(out, job);
  }
  return job;
}

async function decompressOnce(out, os) {
  const temp = `${out}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, await decompressBrotli(await readFile(`${out}.br`)));
    if (os !== "win32") await chmod(temp, 0o755);
    try {
      await rename(temp, out);
    } catch (error) {
      // Windows refuses to replace a running executable; another process already
      // put a complete binary there.
      if (!(await exists(out))) throw error;
    }
    return out;
  } finally {
    await rm(temp, { force: true });
  }
}

/** Absolute path to the afwc executable, or throw with a clear message. */
export async function afwcPath({
  binaryDir = here, environment = process.env, os = process.platform, cpuArch = process.arch,
} = {}) {
  if (environment.AFWC_BIN) {
    if (await exists(environment.AFWC_BIN)) return environment.AFWC_BIN;
    throw new Error(`afwc: AFWC_BIN is set but ${environment.AFWC_BIN} does not exist`);
  }
  const out = hostBinPath({ binaryDir, os, cpuArch });
  if (!out) {
    throw new Error(
      `afwc: no prebuilt binary for ${os}-${cpuArch}. ` +
        `Supported: ${[...SUPPORTED].join(", ")}. Build from source and set AFWC_BIN.`,
    );
  }
  if (await exists(out)) return out;
  if (await exists(`${out}.br`)) return decompress(out, os);
  throw new Error(`afwc: prebuilt binary missing at ${out}. Reinstall @opentf/afw-compiler, or set AFWC_BIN.`);
}
