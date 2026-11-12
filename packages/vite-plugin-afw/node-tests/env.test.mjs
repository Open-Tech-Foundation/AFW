// `PUBLIC_*` environment variables: compiled into the browser bundle and the server
// render alike; every other variable stays out.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { build, createBuilder, createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };

const ENV = [
  "PUBLIC_API_URL=https://api.example.test",
  "SECRET_TOKEN=do-not-ship-me",
  "VITE_LEGACY=vite-prefixed-value",
  "",
].join("\n");

// A page and a component reading env values in setup, attributes and text.
const PAGE = `import EnvBadge from "./EnvBadge.jsx";
const api = import.meta.env.PUBLIC_API_URL;
export default function Home() {
  return (
    <section>
      <a id="api" href={import.meta.env.PUBLIC_API_URL}>{api}</a>
      <p id="mode">{import.meta.env.MODE} {import.meta.env.PROD ? "prod" : "dev"}</p>
      <p id="secret">[{import.meta.env.SECRET_TOKEN ?? "none"}]</p>
      <p id="legacy">[{import.meta.env.VITE_LEGACY ?? "none"}]</p>
      <EnvBadge />
    </section>
  );
}
`;
const BADGE = `export default function EnvBadge() {
  const { PUBLIC_API_URL } = import.meta.env;
  return <span id="badge">{PUBLIC_API_URL}</span>;
}
`;

async function envApp(name = "spa") {
  const app = await copyFixture(name);
  await writeFile(join(app.dir, ".env"), ENV);
  await writeFile(join(app.dir, "app", "page.jsx"), PAGE);
  await writeFile(join(app.dir, "app", "EnvBadge.jsx"), BADGE);
  return app;
}

async function readAssets(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  return (await Promise.all(files.map((f) => readFile(join(dir, f), "utf8")))).join("\n");
}

const callConfig = (plugin, userConfig, env) => plugin.config.call({ meta: {} }, userConfig, env);

test("the plugin exposes PUBLIC_* by default", async () => {
  const config = await callConfig(afw(), { root: process.cwd() }, { command: "serve", mode: "development" });
  assert.equal(config.envPrefix, "PUBLIC_");
});

test("an app's own envPrefix is kept", async () => {
  for (const envPrefix of ["APP_", ["APP_", "PUBLIC_"]]) {
    const config = await callConfig(afw(), { root: process.cwd(), envPrefix }, { command: "serve", mode: "development" });
    assert.ok(!("envPrefix" in config), `kept ${JSON.stringify(envPrefix)}`);
  }
});

test("a build compiles PUBLIC_* in and leaves every other variable out", async () => {
  const { dir, cleanup } = await envApp();
  try {
    await build({ ...quiet, root: dir, plugins: [afw({ mode: "spa" })], build: { outDir: join(dir, "dist") } });
    const js = await readAssets(join(dir, "dist", "assets"));
    assert.match(js, /https:\/\/api\.example\.test/);
    assert.doesNotMatch(js, /do-not-ship-me/, "a non-public variable never reaches the bundle");
    assert.doesNotMatch(js, /vite-prefixed-value/, "VITE_* is not exposed");
    assert.doesNotMatch(js, /import\.meta\.env/, "every read is replaced");
  } finally {
    await cleanup();
  }
});

test("a shell variable beats the .env file", async () => {
  const { dir, cleanup } = await envApp();
  process.env.PUBLIC_API_URL = "https://from-the-shell.test";
  try {
    await build({ ...quiet, root: dir, plugins: [afw({ mode: "spa" })], build: { outDir: join(dir, "dist") } });
    const js = await readAssets(join(dir, "dist", "assets"));
    assert.match(js, /from-the-shell\.test/);
    assert.doesNotMatch(js, /api\.example\.test/);
  } finally {
    delete process.env.PUBLIC_API_URL;
    await cleanup();
  }
});

test("SSG renders the same values the client bundle carries", async () => {
  const { dir, cleanup } = await envApp();
  try {
    await (await createBuilder({ ...quiet, root: dir, plugins: [afw({ mode: "ssg" })] })).buildApp();
    const page = (await readFile(join(dir, "dist", "index.html"), "utf8")).replace(/<!--[\s\S]*?-->/g, "");
    assert.match(page, /<a id="api" href="https:\/\/api\.example\.test">https:\/\/api\.example\.test<\/a>/);
    assert.match(page, /<p id="mode">production prod<\/p>/);
    assert.match(page, /<p id="secret">\[none\]<\/p>/, "the server render does not see secrets either");
    assert.match(page, /<p id="legacy">\[none\]<\/p>/);
    assert.match(page, /<span id="badge">https:\/\/api\.example\.test<\/span>/, "destructuring works");
    assert.doesNotMatch(await readAssets(join(dir, "dist", "assets")), /do-not-ship-me/);
  } finally {
    await cleanup();
  }
});

test("the dev server serves PUBLIC_* in development mode", async () => {
  const { dir, cleanup } = await envApp();
  const server = await createServer({ ...quiet, root: dir, plugins: [afw({ mode: "spa" })], server: { port: 0, host: "127.0.0.1" } });
  try {
    await server.listen();
    const origin = server.resolvedUrls.local[0].replace(/\/$/, "");
    const code = await (await fetch(`${origin}/app/page.jsx`)).text();
    assert.match(code, /https:\/\/api\.example\.test/);
    assert.match(code, /development/);
    assert.doesNotMatch(code, /do-not-ship-me|vite-prefixed-value/);
  } finally {
    await server.close();
    await cleanup();
  }
});
