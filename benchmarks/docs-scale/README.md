# Docs scale benchmark

**What it measures:** how a docs site's built output grows with its page count — the
weight of one page and of the whole site, and the build time — for the `docs` starter
built from this checkout.

## Why it exists

Every prerendered page used to carry the whole sidebar: each link rendered, and the nav
tree repeated in the hydration payload (once per component that took it as a prop, plus
every sidebar node's subtree). A page grew with the size of the site, so the site grew with
its square: 786 KB a page and 778 MB of HTML at 1,000 pages. The fix (`@opentf/afw-docs`
CHANGELOG) keeps the tree in the cached nav chunk and renders only the open branch of a
large tree. This benchmark is how the fix was measured, and how a regression would show.

## Run it

```sh
cargo build --release -p afw_cli                    # the optimized compiler it builds with
esdev benchmarks/docs-scale/run.mjs                 # 1,000 pages in 10 sections
esdev benchmarks/docs-scale/run.mjs --pages=5000 --sections=50
```

- Scaffolds `esdev create --template=docs` from `packages/create-afw` and installs this
  checkout's packages into it (their published files), so it measures what users get.
- Each section is a page with its own child pages: `--pages / --sections` of them.
- Prepares, builds and measures the site in `~/.cache/afw-docs-scale` (`--dir=` to change
  it). Run benchmarks from a solid-state disk.
- Prints a table; the sample page is halfway down the middle section.

## Results

Measured 2026-11-18. Intel i7-8700K, 16 GB RAM, Linux 6.12, esdev 0.28, NVMe disk, the
optimized compiler. 1,000 generated pages in 10 sections of 100 (1,013 docs pages with the
starter's own). "Before" is commit `b3d9da4`, built from a worktree.

| | before | after |
|---|---|---|
| median page | 786.0 KB | 51.4 KB |
| sample page, gzip | 52.6 KB | 4.8 KB |
| sample page, sidebar links | 1,013 | 112 |
| sample page, hydration payload | 381.3 KB | 3.4 KB |
| all docs pages | 777.6 MB | 50.8 MB |
| build | 25.6 s | 5.4 s |
| of which, search index | 14.7 s | 1.5 s |

- "After" pages carry the 10 section rows and the current section's 100 links. A page's
  size now follows the number of sections and the size of its own section, not the site.
- The search index built faster because it parses smaller pages: its time follows the
  HTML it reads. With the debug compiler (`cargo build`) it is about 14 times slower, which
  is why the benchmark needs the optimized one.
- The rest of a page (about 32 KB here) is the theme's chrome and inline scripts, the same
  at any site size: a 58-page site's pages are 32.5 KB.
