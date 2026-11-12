// `@opentf/afw-test/test` under esdev: the test API of `runtime:test`. Selected by the
// `esdev` export condition, so a test file imports the same names in either workflow.
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from "runtime:test";
