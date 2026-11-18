# AFW Search architecture

The unified Rust toolchain’s `afwc docs index` command crawls emitted HTML after SSG. It owns extraction,
tokenization, deterministic document IDs, and index encoding. `@opentf/afw-docs` owns
the post-build hook, the DOM-free reader, and the optional modal component.

```text
SSG HTML → afwc docs index → _search/{manifest, docs, chunks, fragments}
                              ↓
                         headless reader → Search component
```

The writer reads each page once and drops it: pages are parsed and extracted in parallel
batches (rayon) and merged in path order, so the output is identical to a one-thread run.
Work per page is linear in its size.

The reader never references the DOM and every query takes an optional AbortSignal. It
decodes a chunk's term table when the chunk loads and a term's postings only when the term
is looked up, and keeps each loaded fragment for the life of its generation.
The modal owns debouncing, focus, keyboard navigation, and safe rendering of excerpts.

Queries rank pages using the existing document scores, then identify distinct
matching sections from posting offsets and heading anchors. Each page contributes
its best section first; additional sections follow in page order, up to three
cards per page by default. `maxSectionsPerPage: 1` keeps one card per page.
`limit` applies to the final card list, while `total` remains the matching page count.

For a multiword query, expand sections that contain every matched query word.
If the words only occur across separate sections, keep the page's best section
card. Each excerpt stays inside its section and omits code-dump regions; highlight
offsets refer to that excerpt. The index format and native writer are unchanged.
