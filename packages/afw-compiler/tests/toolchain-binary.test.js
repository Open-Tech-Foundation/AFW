import { expect, test } from 'runtime:test';
import { copy, file, makeTempDir, mkdir, remove, write } from 'runtime:fs';
import { dirname, fromFileURL, join } from 'runtime:path';
import { env, platform, arch } from 'runtime:process';
import { Command } from 'runtime:system';
import { afwcPath } from '../index.js';
const here = dirname(fromFileURL(import.meta.url));

test('one toolchain binary resolves overrides and platform-specific package paths', async () => {
  const dir = await makeTempDir({ dir: here, prefix: 'toolchain-bin-' });
  try {
    const override = join(dir, 'custom-toolchain');
    await write(override, 'override');
    expect(await afwcPath({ environment: { AFWC_BIN: override } })).toBe(override);
    await mkdir(join(dir, 'bin/win32-x64'), { recursive: true });
    const windows = join(dir, 'bin/win32-x64/afwc.exe');
    await write(windows, 'windows');
    expect(await afwcPath({ binaryDir: dir, os: 'windows', cpuArch: 'x86_64', environment: {} })).toBe(windows);
    let error;
    try { await afwcPath({ environment: { AFWC_BIN: join(dir, 'missing') } }); } catch (e) { error = e; }
    expect(error.message).toContain('AFWC_BIN');
  } finally { await remove(dir, { recursive: true }); }
});

test('the unified toolchain lazily decompresses and reuses its single archive', async () => {
  const dir = await makeTempDir({ dir: here, prefix: 'toolchain-br-' });
  try {
    // Independently encoded fixture payload; extraction is shared by compilation and indexing.
    const bytes = new Uint8Array([11,6,128,115,101,97,114,99,104,45,98,105,110,97,114,121,3]);
    await mkdir(join(dir, 'bin/linux-x64'), { recursive: true });
    const out = join(dir, 'bin/linux-x64/afwc');
    await write(`${out}.br`, bytes);
    const options = { binaryDir: dir, os: 'linux', cpuArch: 'x86_64', environment: {} };
    expect(await afwcPath(options)).toBe(out);
    expect(await file(out).text()).toBe('search-binary');
    await remove(`${out}.br`);
    expect(await afwcPath(options)).toBe(out);
  } finally { await remove(dir, { recursive: true }); }
});

for (const transitive of [false, true]) test(`a bundled prerender entry resolves the ${transitive ? 'transitive' : 'direct'} compiler archive`, async () => {
  const dir = await makeTempDir({ dir: here, prefix: 'toolchain-bundle-' });
  try {
    const pluginDir = join(dir, 'node_modules/@opentf/esdev-plugin-afw');
    const packageDir = transitive ? join(pluginDir, 'node_modules/@opentf/afw-compiler') : join(dir, 'node_modules/@opentf/afw-compiler');
    await mkdir(packageDir, { recursive: true });
    if (transitive) {
      await write(join(pluginDir, 'package.json'), '{"name":"@opentf/esdev-plugin-afw","type":"module","exports":"./index.js"}');
      await write(join(pluginDir, 'index.js'), 'export { afwcPath } from "@opentf/afw-compiler";');
    }
    for (const name of ['package.json', 'index.js', 'extract.js']) {
      await copy(join(here, '..', name), join(packageDir, name));
    }
    const os = { linux: 'linux', macos: 'darwin', windows: 'win32' }[platform];
    const cpu = { x86_64: 'x64', aarch64: 'arm64' }[arch];
    const binaryDir = join(packageDir, 'bin', `${os}-${cpu}`);
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, platform === 'windows' ? 'afwc.exe' : 'afwc');
    await write(`${binary}.br`, new Uint8Array([11,6,128,115,101,97,114,99,104,45,98,105,110,97,114,121,3]));
    await write(join(dir, 'package.json'), '{"type":"module"}');
    await write(join(dir, 'prerender.js'), `
import { afwcPath } from '${transitive ? '@opentf/esdev-plugin-afw' : '@opentf/afw-compiler'}';
import { file } from 'runtime:fs';
const binary = await afwcPath({ environment: {} });
console.log(JSON.stringify({ binary, payload: await file(binary).text() }));
`);
    await write(join(dir, 'esdev.json'), JSON.stringify({ build: { targets: {
      prerender: { entry: 'prerender.js', out: '.ssg/prerender.js', then: 'run' },
    } } }));
    const result = await new Command(env.ESDEV_BIN || 'esdev', {
      args: ['build'], cwd: dir, inheritEnv: true, timeout: 15000,
    }).output();
    if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
    const line = new TextDecoder().decode(result.stdout).split('\n').find(line => line.startsWith('{'));
    const resolved = JSON.parse(line);
    expect(resolved.binary).toBe(binary);
    expect(resolved.payload).toBe('search-binary');
    expect(await file(binary).text()).toBe('search-binary');
  } finally { await remove(dir, { recursive: true }); }
});

// A real executable (a shell script, padded so writing it takes a moment) packed the
// way the package ships it, in a fresh copy of the package with nothing extracted yet.
async function packedToolchain(prefix) {
  const dir = await makeTempDir({ dir: here, prefix });
  for (const name of ['package.json', 'index.js', 'extract.js']) {
    await copy(join(here, '..', name), join(dir, name));
  }
  await mkdir(join(dir, 'bin/linux-x64'), { recursive: true });
  const script = `#!/bin/sh\necho toolchain-ok\nexit 0\n# ${'x'.repeat(4 * 1024 * 1024)}\n`;
  const packed = new Blob([script]).stream().pipeThrough(new CompressionStream('brotli'));
  await write(join(dir, 'bin/linux-x64/afwc.br'), new Uint8Array(await new Response(packed).arrayBuffer()));
  await write(join(dir, 'probe.mjs'), `
import { afwcPath } from './index.js';
import { Command } from 'runtime:system';
const options = { binaryDir: ${JSON.stringify(dir)}, os: 'linux', cpuArch: 'x86_64', environment: {} };
const paths = await Promise.all(Array.from({ length: 4 }, () => afwcPath(options)));
for (const path of paths) {
  const run = await new Command(path, { stdout: 'piped', stderr: 'piped' }).output();
  if (!run.success) throw new Error(new TextDecoder().decode(run.stderr));
  console.log(new TextDecoder().decode(run.stdout).trim());
}
`);
  return dir;
}

test('concurrent first uses all get a complete, runnable binary', async () => {
  if (platform !== 'linux') return; // the fixture is a shell script
  const dir = await packedToolchain('toolchain-race-');
  try {
    // Several processes extract and immediately run the binary at the same moment, each
    // also racing four calls of its own, like parallel test files on a fresh install.
    const runs = await Promise.all(Array.from({ length: 6 }, () => new Command(env.ESDEV_BIN || 'esdev', {
      args: ['probe.mjs'], cwd: dir, inheritEnv: true, stdout: 'piped', stderr: 'piped',
    }).output()));
    for (const run of runs) {
      const stderr = new TextDecoder().decode(run.stderr);
      expect(stderr.includes('Text file busy')).toBe(false);
      expect(run.success).toBe(true);
      expect(new TextDecoder().decode(run.stdout).trim().split('\n')).toEqual(Array(4).fill('toolchain-ok'));
    }
    const leftovers = [];
    for await (const entry of await (await import('runtime:fs')).readDir(join(dir, 'bin/linux-x64'))) leftovers.push(entry.name);
    expect(leftovers.sort()).toEqual(['afwc', 'afwc.br']);
  } finally { await remove(dir, { recursive: true }); }
});
