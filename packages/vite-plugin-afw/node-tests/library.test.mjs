// A component library that publishes JSX source (what `create-afw --template library`
// makes), consumed by an app from node_modules: the dev server, the client build, the
// prerender on Node and Vitest must all compile it, not load it as it is.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createBuilder, createServer } from "vite";
import { startVitest } from "vitest/node";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };
let dir, cleanup;

before(async () => {
  ({ dir, cleanup } = await copyFixture("spa"));
  const lib = join(dir, "node_modules", "afw-demo-ui");
  await mkdir(join(lib, "src"), { recursive: true });
  await writeFile(join(lib, "package.json"), JSON.stringify({
    name: "afw-demo-ui", version: "1.0.0", type: "module", exports: { ".": "./index.js" },
    peerDependencies: { "@opentf/afw": "*" },
  }));
  await writeFile(join(lib, "index.js"), 'export { default as Greeting } from "./src/Greeting.jsx";\nexport { default as Tag } from "./src/Tag.tsx";\n');
  // A TypeScript component too: a library may publish .tsx source.
  await writeFile(join(lib, "src", "Tag.tsx"), `interface TagProps { text: string }
export default function Tag({ text }: TagProps) {
  const shout = (value: string): string => value.toUpperCase();
  return <em id="tag">{shout(text)}</em>;
}
`);
  await writeFile(join(lib, "src", "Greeting.jsx"), `export default function Greeting({ name }) {
  let clicks = $state(0);
  return <button id="greeting" onclick={() => clicks++}>Hello {name} from the library ({clicks})</button>;
}
`);
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module", dependencies: { "afw-demo-ui": "1.0.0" } }));
  await writeFile(join(dir, "app", "page.jsx"), `import { Greeting, Tag } from "afw-demo-ui";

export default function Home() {
  return <section><h1 id="title">Home</h1><Greeting name="Ada" /><Tag text="typed tag" /></section>;
}
`);
  await mkdir(join(dir, "tests"), { recursive: true });
  await writeFile(join(dir, "tests", "greeting.test.js"), `import { expect, test } from "vitest";
import { render } from "@opentf/afw-test";
import { Greeting } from "afw-demo-ui";

test("renders the library component", () => {
  const { getByRole } = render(Greeting, { name: "Lin" });
  expect(getByRole("button").textContent).toContain("Hello Lin from the library");
});
`);
});
after(() => cleanup?.());

test("the dev server compiles the library instead of pre-bundling it", async () => {
  const server = await createServer({ ...quiet, root: dir, plugins: [afw()], server: { port: 0 } });
  try {
    assert.ok(server.config.optimizeDeps.exclude.includes("afw-demo-ui"), "kept out of dependency pre-bundling");
    const mod = await server.transformRequest(join(dir, "node_modules", "afw-demo-ui", "src", "Greeting.jsx"));
    assert.doesNotMatch(mod.code, /\$state\(/, "the macro was compiled");
    assert.doesNotMatch(mod.code, /jsx\(|React/, "not read as React JSX");
    const tsx = await server.transformRequest(join(dir, "node_modules", "afw-demo-ui", "src", "Tag.tsx"));
    assert.doesNotMatch(tsx.code, /interface TagProps|: string/, "TypeScript stripped");
  } finally {
    await server.close();
  }
});

test("a prerendered build renders the library component on Node", async () => {
  await writeFile(join(dir, "app", "_config.js"), 'export default { render: "static" };\n');
  await (await createBuilder({ ...quiet, root: dir, plugins: [afw()] })).buildApp();
  const html = await readFile(join(dir, "dist", "index.html"), "utf8");
  assert.match(html, /Hello <!--[^>]*-->?Ada|Hello Ada/);
  assert.match(html, /from the library/);
  assert.match(html, /TYPED TAG/, "the .tsx component rendered, types stripped");
});

test("Vitest compiles the library", async () => {
  // Inline config: the consumer's own package.json makes the fixture its own package.
  // Vitest runs from the project, as \`npm test\` does.
  const previous = process.cwd();
  process.chdir(dir);
  after(() => process.chdir(previous));
  const vitest = await startVitest("test", [], {
    root: dir, run: true, watch: false, reporters: [], config: false,
    environment: "happy-dom", setupFiles: ["@opentf/afw-test/vitest"],
  }, { plugins: [afw()] });
  try {
    const files = vitest.state.getFiles();
    assert.deepEqual(files.flatMap((f) => f.result?.errors ?? []).map((e) => e.message), []);
    assert.deepEqual(files.flatMap((f) => f.tasks).map((t) => `${t.name}: ${t.result?.state}`), ["renders the library component: pass"]);
  } finally {
    await vitest.close();
  }
});
