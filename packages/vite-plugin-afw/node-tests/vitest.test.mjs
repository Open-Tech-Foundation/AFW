import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { startVitest } from "vitest/node";

import { copyFixture } from "./helpers.mjs";

async function runVitest(dir) {
  const vitest = await startVitest("test", [], { root: dir, run: true, watch: false, reporters: [] });
  try {
    const files = vitest.state.getFiles();
    const tests = files.flatMap((f) => f.tasks);
    return {
      files: files.length,
      passed: tests.filter((t) => t.result?.state === "pass").map((t) => t.name),
      failed: tests.filter((t) => t.result?.state === "fail").map((t) => t.name),
      errors: files.flatMap((f) => f.result?.errors ?? []).map((e) => e.message),
    };
  } finally {
    await vitest.close();
  }
}

test("@opentf/afw-test runs AFW component and page tests under Vitest", async () => {
  const { dir, cleanup } = await copyFixture("vitest");
  try {
    const result = await runVitest(dir);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.failed, []);
    assert.equal(result.files, 2);
    assert.deepEqual(result.passed.sort(), [
      "a TypeScript page mounts, runs onMount and reacts to typing",
      "each test starts from a clean document",
      "increments on click and derives a value",
    ]);
  } finally {
    await cleanup();
  }
});

test("a failing assertion and a compile error are reported, not swallowed", async () => {
  const { dir, cleanup } = await copyFixture("vitest");
  try {
    await writeFile(join(dir, "tests", "fail.test.js"), 'import { expect, test } from "vitest";\ntest("fails", () => expect(1).toBe(2));\n');
    await writeFile(join(dir, "app", "Broken.jsx"), "export default function Broken() { return <p>; }\n");
    await writeFile(join(dir, "tests", "broken.test.js"), 'import Broken from "../app/Broken.jsx";\nimport { test } from "vitest";\ntest("never runs", () => Broken);\n');
    process.exitCode = undefined;
    const result = await runVitest(dir);
    process.exitCode = 0;
    assert.deepEqual(result.failed, ["fails"]);
    assert.ok(result.errors.some((m) => /Unexpected token/.test(m)), JSON.stringify(result.errors));
  } finally {
    await cleanup();
  }
});
