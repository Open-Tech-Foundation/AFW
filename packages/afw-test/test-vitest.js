// `@opentf/afw-test/test` under Vite: Vitest's test API, selected by the `vitest` export
// condition (`@opentf/vite-plugin-afw` sets it for test runs). A test file imports these
// names from `@opentf/afw-test/test`, so the same file runs under esdev (`runtime:test`).
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from "vitest";
