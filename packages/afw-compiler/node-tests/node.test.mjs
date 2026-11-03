// Node-side tests (`node --test`), kept out of the esdev suites' `tests/` folder.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { brotliCompressSync } from "node:zlib";

import { afwcPath } from "@opentf/afw-compiler/node";

const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
const scratch = async () => {
  const d = await mkdtemp(join(tmpdir(), "afwc-node-"));
  dirs.push(d);
  return d;
};

test("AFWC_BIN wins when it exists, and fails clearly when it does not", async () => {
  const dir = await scratch();
  const bin = join(dir, "afwc");
  await writeFile(bin, "");
  assert.equal(await afwcPath({ environment: { AFWC_BIN: bin } }), bin);
  await assert.rejects(afwcPath({ environment: { AFWC_BIN: join(dir, "missing") } }), /AFWC_BIN is set/);
});

test("decompresses the host's brotli archive once, executable, even under concurrent first use", async () => {
  const dir = await scratch();
  await mkdir(join(dir, "bin", "linux-x64"), { recursive: true });
  await writeFile(join(dir, "bin", "linux-x64", "afwc.br"), brotliCompressSync(Buffer.from("#!/bin/sh\necho afwc\n")));
  const opts = { binaryDir: dir, environment: {}, os: "linux", cpuArch: "x64" };
  const [a, b] = await Promise.all([afwcPath(opts), afwcPath(opts)]);
  assert.equal(a, join(dir, "bin", "linux-x64", "afwc"));
  assert.equal(b, a);
  assert.equal(await readFile(a, "utf8"), "#!/bin/sh\necho afwc\n");
  assert.ok((await stat(a)).mode & 0o100);
});

test("an unsupported platform or a missing archive is a clear error", async () => {
  const dir = await scratch();
  await assert.rejects(afwcPath({ binaryDir: dir, environment: {}, os: "aix", cpuArch: "ppc64" }), /no prebuilt binary for aix-ppc64/);
  await assert.rejects(afwcPath({ binaryDir: dir, environment: {}, os: "linux", cpuArch: "x64" }), /prebuilt binary missing/);
});
