//! Resolve the `afwc` compiler binary for the current platform.
//
// afwc is a Rust binary. It ships brotli-compressed for every supported platform
// inside this single package under `bin/<platform>-<arch>/afwc[.exe].br`; the
// host's copy is decompressed on install (and lazily here as a fallback). The
// toolchain (`@opentf/afw-cli`) calls `afwcPath()` to get the executable path.
// `AFWC_BIN` overrides everything (used in this repo's own dev to point at the
// cargo build). See extract.js for the decompression logic.

export { afwcPath } from "./extract.js";
