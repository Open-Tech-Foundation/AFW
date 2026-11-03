# @opentf/afw-build

The toolchain-neutral core of the AFW build. AFW ships two official workflows, each a
thin integration over this package:

| Workflow | Toolchain package | Runs on |
| --- | --- | --- |
| esdev + ES-Runtime | `@opentf/esdev-plugin-afw` | ES-Runtime |
| Vite + Node | `@opentf/vite-plugin-afw` | Node |

You normally install one of those, not this package directly.

## What lives here

| Module | Purpose |
| --- | --- |
| `compiler-client.js` | The `afwc serve` protocol: one long-lived compiler child for every module |
| `compile.js` | Compiler target rules (`chooseTarget`), the compile-error stub, route-module detection |
| `resolve-compiler.js` | Finds `afwc`: `AFWC_BIN`, the prebuilt `@opentf/afw-compiler` binary, or a cargo build in a source checkout |
| `routes.js` | File-based routing: page, layout, 404 and loader discovery, and the `@afw/routes` module |
| `server.js` | Server routing: API routes, middleware and loaders composed into the `@afw/server` handler |
| `host.js` | The host interface the above run against |

## The host interface

Nothing here imports `runtime:*` or `node:*`. A toolchain supplies a host object with
file access (`readText`, `readDir`, `kind`), processes (`spawn`, `run`), `cwd`, `env`
and `path` helpers; see `host.js` for the full contract. A test enforces that the
package stays platform-free.

## License

MIT
