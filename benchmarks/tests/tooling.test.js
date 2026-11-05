import { expect, test } from 'runtime:test';
import { file, makeTempDir, mkdir, remove, write } from 'runtime:fs';
import { dirname, fromFileURL, join } from 'runtime:path';
import { env } from 'runtime:process';
import { Command } from 'runtime:system';
const root = dirname(dirname(dirname(fromFileURL(import.meta.url))));
const executable = env.ESDEV_BIN || 'esdev';

async function run(script, args) {
  const result = await new Command(executable, { args: [join(root, script), ...args], cwd: root, inheritEnv: true }).output();
  if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
}

// The full-stack benchmark's scripts are Node scripts (benchmarks/fullstack).
async function runNode(script, args) {
  const result = await new Command('node', { args: [join(root, script), ...args], cwd: root, inheritEnv: true }).output();
  if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
}

test('native benchmark fixture generator preserves frontmatter and body separators', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const tmp = await makeTempDir({ dir: join(root, '.cache'), prefix: 'benchmark-ladder-' });
  try {
    const source = join(tmp, 'source.mdx');
    const header = '---\ntitle: Fixture\n---', body = '\n# Body\n\n---\nKeep this rule.\n';
    await write(source, header + body);
    await run('benchmarks/ssg-build/make-ladder.mjs', [source, tmp]);
    expect(await file(join(tmp, 'spec-1x.mdx')).text()).toBe(header + body);
    expect(await file(join(tmp, 'spec-32x.mdx')).text()).toBe(header + body.repeat(32));
  } finally { await remove(tmp, { recursive: true }); }
});

test('native report aggregation pools samples and respects the timing resolution', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const tmp = await makeTempDir({ dir: join(root, '.cache'), prefix: 'benchmark-report-' });
  try {
    const first = join(tmp, 'first.json'), second = join(tmp, 'second.json'), out = join(tmp, 'report.json');
    const record = (values) => ({ engines: ['afw', 'react'], results: values.map((samples, i) => ({ engine: ['afw', 'react'][i], cases: [{ label: 'create', samples, median: samples[0] }] })) });
    await write(first, JSON.stringify(record([[10, 20], [100, 110]])));
    await write(second, JSON.stringify(record([[30, 40], [120, 130]])));
    await run('benchmarks/aggregate.mjs', [first, second, `--out=${out}`]);
    const result = await file(out).json();
    expect(result.runs).toBe(2);
    expect(result.rows[0].values).toEqual({ afw: 25, react: 115 });
    expect(result.rows[0].best).toBe('afw');
    await write(second, JSON.stringify(record([[10, 20], [11, 21]])));
    await run('benchmarks/aggregate.mjs', [second, `--out=${out}`]);
    expect((await file(out).json()).rows[0].best).toBeNull();
  } finally { await remove(tmp, { recursive: true }); }
});

test('full-stack generator writes SolidStart and SvelteKit routes in their own conventions', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const tmp = await makeTempDir({ dir: join(root, '.cache'), prefix: 'fullstack-gen-' });
  try {
    await runNode('benchmarks/fullstack/generate.mjs', ['solidstart', join(tmp, 'solid'), '3']);
    expect(await file(join(tmp, 'solid/src/routes/pages/p3.jsx')).text()).toContain('<h1 class="text-2xl font-bold">Page 3</h1>');
    expect(await file(join(tmp, 'solid/components/gen/Widget3.jsx')).text()).toContain('createSignal(false)');
    expect(await file(join(tmp, 'solid/src/routes/docs/getting-started.mdx')).text()).toContain('# Getting Started');
    expect((await file(join(tmp, 'solid/data/products.json')).json()).length).toBe(50);
    await runNode('benchmarks/fullstack/generate.mjs', ['sveltekit', join(tmp, 'svelte'), '3']);
    expect(await file(join(tmp, 'svelte/src/routes/pages/p3/+page.svelte')).text()).toContain('import Widget from "../../../../components/gen/Widget3.svelte"');
    expect(await file(join(tmp, 'svelte/components/gen/Widget3.svelte')).text()).toContain('$state(false)');
    expect(await file(join(tmp, 'svelte/src/routes/docs/faq/+page.md')).text()).toContain('| Option | Default | Meaning |');
    // A smaller regeneration removes the pages the larger one wrote.
    await runNode('benchmarks/fullstack/generate.mjs', ['sveltekit', join(tmp, 'svelte'), '1']);
    expect(await file(join(tmp, 'svelte/src/routes/pages/p3/+page.svelte')).exists()).toBe(false);
  } finally { await remove(tmp, { recursive: true }); }
});

test('full-stack report merges results files, newest per tool, and skips cells that failed parity', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const tmp = await makeTempDir({ dir: join(root, '.cache'), prefix: 'fullstack-report-' });
  try {
    const cell = (buildSeconds, parity = true) => ({ 10: { parity, buildMemoryMb: 100, buildSeconds, devStartSeconds: 1, editToBrowserSeconds: 0.05 } });
    const day = (measuredAt, tools) => JSON.stringify({ measuredAt, runs: 3, sizes: [10], tools });
    const older = join(tmp, '2026-11-04.json'), newer = join(tmp, '2026-11-05.json'), out = join(tmp, 'report.json');
    await write(older, day('2026-11-04', { 'afw-esdev': cell(2), next: cell(9), sveltekit: cell(1) }));
    await write(newer, day('2026-11-05', { sveltekit: cell(3), solidstart: cell(4, ['docs: MDX page with its table']) }));
    await runNode('benchmarks/fullstack/report.mjs', [older, newer, `--out=${out}`]);
    const report = await file(out).json();
    expect(report.measuredAt).toBe('2026-11-04 to 2026-11-05');
    expect(report.engines).toContain('solidstart');
    const buildTime = report.tables[0].rows.find((row) => row.label === 'Build time (s)');
    expect(buildTime.values).toEqual({ 'afw-esdev': 2, next: 9, sveltekit: 3 });
    expect(buildTime.best).toBe('afw-esdev');
  } finally { await remove(tmp, { recursive: true }); }
});
