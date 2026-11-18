import { expect, test } from '../../afw-cli/tests/harness.js';
import { chmod, file, makeTempDir, mkdir, remove, write } from 'runtime:fs';
import { dirname, fromFileURL, join } from 'runtime:path';
import { env, platform } from 'runtime:process';
import { Command } from 'runtime:system';
import { createSearch } from '../search.js';

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));
const binary = env.AFWC_BIN || join(root, 'target', 'debug', platform === 'windows' ? 'afwc.exe' : 'afwc');

test('the Rust writer and JS reader agree on content, metadata, and deployment generations', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const site = await makeTempDir({ dir: join(root, '.cache'), prefix: '.afw-search-test-' });
  const original = globalThis.fetch;
  const build = async () => {
    const result = await new Command(binary, { args: ['docs', 'index', site], stdout: 'piped', stderr: 'piped' }).output();
    if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
  };
  globalThis.fetch = async (url) => {
    try { return new Response(await file(join(site, String(url).replace(/^\//, ''))).arrayBuffer()); }
    catch { return new Response(null, { status: 404 }); }
  };
  try {
    await write(join(site, 'index.html'), '<main data-afw-search-body><h1>Guide &amp; Reference</h1><p>😀 café</p><h2 id="routing">Routing</h2><p>route.<em>params</em> Alpha</p><div class="afw-code-head">JSX Copy</div><pre><code>&lt;div class="UniqueExampleToken"&gt;sample&lt;/div&gt;</code></pre><span data-afw-search-ignore>IgnoreSentinel</span></main><p>OutsideSentinel</p><nav data-afw-search-meta="breadcrumb"><afw-raw-html><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script></afw-raw-html><span>Docs</span><span>/</span><span>Guides</span><span hidden>HiddenMetadataNoise</span></nav>');
    await write(join(site, '404.html'), '<main>Not searchable</main>');
    await build();
    const old = createSearch();
    const result = await old.query('route.params');
    expect(result.partial).toBe(false);
    expect(result.results[0].title).toBe('Guide & Reference');
    expect(result.results[0].url).toBe('/#routing');
    expect(result.results[0].meta.breadcrumb).toBe('Docs / Guides');
    expect(result.results[0].text.includes('route.params')).toBe(true);
    expect(result.results[0].section).toBe('Routing');
    expect(result.results[0].excerpt.includes('<div')).toBe(false);
    expect(result.results[0].text.includes('JSX Copy')).toBe(false);
    expect((await old.query('UniqueExampleToken')).total).toBe(1);
    expect((await old.query('Copy')).total).toBe(0);
    expect((await old.query('IgnoreSentinel')).total).toBe(0);
    expect((await old.query('OutsideSentinel')).total).toBe(0);
    expect((await old.query('café')).partial).toBe(false);
    const pos = result.results[0].anchors[0].pos;
    expect(result.results[0].text.slice(pos, pos + 7)).toBe('Routing');
    await write(join(site, 'index.html'), '<main data-afw-search-body><h1>New guide</h1><p>Beta</p></main>');
    await build();
    // The old client uses its complete old generation, never new fragments with old IDs.
    expect((await old.query('Alpha')).results[0].title).toBe('Guide & Reference');
    expect((await createSearch().query('Beta')).results[0].title).toBe('New guide');
  } finally {
    globalThis.fetch = original;
    await remove(site, { recursive: true });
  }
});

test('enabled indexing failures propagate instead of producing a successful SSG build', async () => {
  const { runDocsSearchIndex } = await import('../../afw-cli/src/shared.js');
  expect(await runDocsSearchIndex(root, {}, '/missing-site', binary)).toBeNull();
  let error;
  try {
    await runDocsSearchIndex(root, { docs: { search: { provider: 'afw' } } }, join(root, '.cache', 'missing-search-site'), join(dirname(binary), platform === 'windows' ? 'afwc.exe' : 'afwc'));
  } catch (e) { error = e; }
  expect(Boolean(error)).toBe(true);
  expect(error.message).toContain('Search site directory does not exist');
});

test('one indexed page produces separate highlighted cards for its matching sections', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const site = await makeTempDir({ dir: join(root, '.cache'), prefix: 'search-sections-' });
  const original = globalThis.fetch;
  try {
    await write(join(site, 'index.html'), '<main data-afw-search-body><h1>Guide</h1><h2 id="first">First section</h2><p>Routing alpha.</p><h2 id="second">Second section</h2><p>Routing beta.</p><script type="application/ld+json">{"noise":"Routing schema"}</script></main>');
    const built = await new Command(binary, { args: ['docs', 'index', site], stdout: 'piped', stderr: 'piped' }).output();
    if (!built.success) throw Error(new TextDecoder().decode(built.stderr));
    globalThis.fetch = async url => new Response(await file(join(site, String(url).replace(/^\//, ''))).arrayBuffer());
    const result = await createSearch().query('routing');
    expect(result.total).toBe(1);
    expect(result.results.map(card => card.url)).toEqual(['/#first', '/#second']);
    expect(result.results.map(card => card.section)).toEqual(['First section', 'Second section']);
    expect(result.results[0].excerpt.includes('beta')).toBe(false);
    expect(result.results[1].excerpt.includes('alpha')).toBe(false);
    for (const card of result.results) {
      expect(card.excerpt.includes('schema')).toBe(false);
      expect(card.highlights.map(([from, to]) => card.excerpt.slice(from, to))).toEqual(['Routing']);
    }
  } finally { globalThis.fetch = original; await remove(site, { recursive: true }); }
});


test('an older compiler printing help cannot silently succeed at indexing', async () => {
  if (platform === 'windows') return; // The fake executable uses a Unix shebang.
  const { indexWithAfwSearch } = await import('../build/search.js');
  await mkdir(join(root, '.cache'), { recursive: true });
  const dir = await makeTempDir({ dir: join(root, '.cache'), prefix: 'old-toolchain-' });
  try {
    const old = join(dir, 'afwc');
    await write(old, '#!/bin/sh\nprintf "usage: afwc build <file>\\n"\n');
    await chmod(old, 0o755);
    let error;
    try { await indexWithAfwSearch({ siteDir: dir, afwc: old }); } catch (e) { error = e; }
    expect(error.message).toContain('did not report an index');
  } finally { await remove(dir, { recursive: true }); }
});

test('hidden tab panels, CJK text, edge punctuation and acronyms are searchable; fragments load once', async () => {
  await mkdir(join(root, '.cache'), { recursive: true });
  const site = await makeTempDir({ dir: join(root, '.cache'), prefix: '.afw-search-test-' });
  const original = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    try { return new Response(await file(join(site, String(url).replace(/^\//, ''))).arrayBuffer()); }
    catch { return new Response(null, { status: 404 }); }
  };
  try {
    await write(join(site, 'index.html'), '<main><h1>Install</h1><p>Run the installer.</p>' +
      '<div role="tabpanel"><p>npm ShownPanel</p></div><div role="tabpanel" hidden><p>irm InactivePanel</p></div>' +
      '<div hidden="until-found"><p>FoundLater</p></div><div hidden><p>TrulyHiddenNoise</p></div>' +
      '<p>日本語のドキュメント検索</p><p>Extend HTMLElement here.</p></main>');
    const result = await new Command(binary, { args: ['docs', 'index', site], stdout: 'piped', stderr: 'piped' }).output();
    if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
    const search = createSearch();
    expect((await search.query('InactivePanel')).total).toBe(1); // an inactive tab panel's text
    expect((await search.query('irm')).total).toBe(1);
    expect((await search.query('FoundLater')).total).toBe(1); // hidden="until-found"
    expect((await search.query('TrulyHiddenNoise')).total).toBe(0); // plain hidden stays out
    expect((await search.query('検索')).total).toBe(1); // a CJK bigram inside a run
    expect((await search.query('ドキュメント')).total).toBe(1); // a longer CJK query: every bigram
    expect((await search.query('文書')).total).toBe(0); // characters that never appear together
    expect((await search.query('installer')).total).toBe(1); // "installer." indexed as a word
    expect((await search.query('element')).total).toBe(1); // part of "HTMLElement"
    const first = fetched.filter((url) => url.includes('/f/')).length;
    await search.query('installer');
    await search.query('installer');
    expect(fetched.filter((url) => url.includes('/f/')).length).toBe(first); // fragments cached
  } finally {
    globalThis.fetch = original;
    await remove(site, { recursive: true });
  }
});
