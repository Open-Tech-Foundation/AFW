# AFW Search plan

## Complete

- [x] Phase 1: deterministic HTML crawl, extraction, headless reader, docs build hook, and
  internal `inspect` / `query` commands.
- [x] Phase 2: content-addressed manifest, varint document table, front-coded term chunks,
  the JS binary decoder, and immutable fragment generations (SPEC-FORMAT.md).
- [x] Phase 3: tokenizer parity on shared vectors (SPEC-TOKENIZER.md), BM25 with field
  weights, heading anchors, sectioned excerpts and highlights.
- [x] Phase 4 (part): prefix expansion of the last query word across chunks, and the
  fallback to the best partial match when no page holds every word.
- [x] Phase 5: the accessible search dialog and the public reader (`createSearch`).
- [x] Phase 6 (part): the `afwc` binary ships with `@opentf/afw-compiler`.
- [x] Indexer: one parse per page, linear extraction, parallel batches merged in path
  order (deterministic output); inactive tab panels and `hidden="until-found"` indexed.
- [x] Tokenizer: edge punctuation trimmed, acronyms split, 64-byte cap, CJK bigrams.
- [x] Reader: lazy posting decode, per-generation fragment cache.

## Next

- [ ] Filters: index `data-afw-search-filter` values and let `query()` restrict by them
  (the format reserves no space yet, and the API does not advertise them).
- [ ] Request and size budgets: measure a query's requests and bytes on large sites
  (`benchmarks/docs-scale`), and set limits a regression would trip.
- [ ] Deployment guidance: `manifest.json` revalidated, hashed files cached immutably,
  per host (static hosts, CDNs, the AFW server).
