# @opentf/afw-compiler

Prebuilt binaries for **afwc**, the AFW IR compiler (a Rust binary). You
normally don't install this directly — `@opentf/afw-cli` depends on it.

```js
import { afwcPath } from "@opentf/afw-compiler";
const bin = afwcPath(); // absolute path to the afwc executable for this platform
```

## How it works

This single package ships the `afwc` binary for every supported platform,
**brotli-compressed**, under `bin/<platform>-<arch>/afwc[.exe].br` (~0.65 MB each
vs ~2.3 MB raw). `afwcPath()` decompresses **only the host's** binary lazily on
first use, so installation has no Node lifecycle hook, and returns the path
matching the host.

Shipping all platforms in one package is cheaper to maintain than the per-platform
optionalDependencies fan-out that rolldown/swc/esbuild use (their binaries are far
larger). `AFWC_BIN` overrides everything (used in this repo's own dev to point at
the cargo `target/` build).

## Releasing (CI)

`bin/` is empty in git, and the package is `private: true` only as a guard so the
monorepo release flow doesn't ship it binary-less. It is published by its own
workflow, `.github/workflows/release-compiler.yml` (run manually after a release):
that cross-builds afwc for each target, brotli-compresses each into
`bin/<platform>/`, flips `private` off, and publishes — so the package on npm is
public.
