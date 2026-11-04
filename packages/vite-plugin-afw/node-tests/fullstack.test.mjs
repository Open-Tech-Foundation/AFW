import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { build, createServer } from "vite";

import { serverFunctionEndpoint } from "@opentf/afw-build";
import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };
const exists = (p) => access(p).then(() => true, () => false);
const html = { accept: "text/html" };

// The checks both the dev server and the built server must pass.
async function serverContract(origin) {
  const api = await fetch(`${origin}/api/hello?name=ada`);
  assert.equal(api.status, 200);
  assert.equal(api.headers.get("x-afw-middleware"), "yes");
  const body = await api.json();
  assert.equal(body.hello, "ada");
  assert.equal(body.via, "middleware", "middleware locals reach the route");
  assert.match(body.digest, /^[0-9a-f]{8}$/, "node:crypto ran");
  assert.equal(body.platform, process.platform, "node:os ran");

  const posted = await fetch(`${origin}/api/hello`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' });
  assert.equal(posted.status, 201);
  assert.deepEqual(await posted.json(), { received: { a: 1 } });

  // A browser navigation (Accept: text/html) to an API route still reaches the route.
  assert.equal((await (await fetch(`${origin}/api/hello`, { headers: html })).json()).hello, "world");

  assert.deepEqual(await (await fetch(`${origin}/todos/__data.json`)).json(), {
    todos: ["write the Vite plugin", "test it on Node"], via: "middleware",
  });

  const page = await fetch(`${origin}/todos`, { headers: html });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="app"><\/div>/);

  const guarded = await fetch(`${origin}/admin`, { headers: html, redirect: "manual" });
  assert.equal(guarded.status, 302);
  assert.equal(guarded.headers.get("location"), "/");
}

// Server functions, called as the browser stub calls them (same origin).
async function serverFunctionContract(origin, dir) {
  const endpoint = (file, name) => `${origin}${serverFunctionEndpoint(`${dir}/app`, `${dir}/app/${file}`, name)}`;
  const same = { origin };
  const list = await fetch(`${endpoint("todos/todos.server.js", "listTodos")}?a=${encodeURIComponent('{"prefix":"test"}')}`, { headers: same });
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.deepEqual(await list.json(), { todos: ["test it on Node"], via: "middleware" }, "middleware locals reach the function");

  const add = endpoint("todos/todos.server.js", "addTodo");
  const post = (body, headers = {}) => fetch(add, { method: "POST", headers: { ...same, "content-type": "application/json", ...headers }, body });
  assert.deepEqual(await (await post('{"title":"x"}')).json(), { added: "x", checked: true });
  assert.equal((await post("{}")).status, 422, "a thrown Response passes through");
  assert.equal((await fetch(add, { headers: same })).status, 405, "an action is POST only");
  assert.equal((await post('{"title":"x"}', { origin: "https://evil.test" })).status, 403, "cross-site calls are refused");

  // The admin folder's middleware guards its functions too.
  const stats = await fetch(endpoint("admin/stats.server.js", "stats"), { headers: same, redirect: "manual" });
  assert.equal(stats.status, 302);
  const allowed = await fetch(endpoint("admin/stats.server.js", "stats"), { headers: { ...same, "x-role": "admin" } });
  assert.deepEqual(await allowed.json(), { users: 3 });

  // Plain exports are not endpoints.
  const helper = await fetch(endpoint("todos/todos.server.js", "helper"), { headers: same });
  assert.doesNotMatch(helper.headers.get("content-type") ?? "", /json/);
  assert.doesNotMatch(await helper.text(), /server-only-secret/);
}

describe("dev server", () => {
  let server, dir, cleanup, origin;
  before(async () => {
    ({ dir, cleanup } = await copyFixture("fullstack"));
    process.chdir(dir); // the fixture's loader reads data relative to the working directory
    server = await createServer({ ...quiet, root: dir, plugins: [afw()], server: { port: 0, host: "127.0.0.1" } });
    await server.listen();
    origin = server.resolvedUrls.local[0].replace(/\/$/, "");
  });
  after(async () => {
    await server?.close();
    await cleanup?.();
  });

  test("runs API routes, middleware and loaders on Node", () => serverContract(origin));

  test("answers server functions under the folder's middleware", () => serverFunctionContract(origin, dir));

  test("serves a .server module to the browser as stubs only", async () => {
    const code = await (await fetch(`${origin}/app/todos/todos.server.js`)).text();
    assert.match(code, /serverFunction\(/);
    assert.match(code, /listTodos/);
    assert.doesNotMatch(code, /server-only-secret|node:fs|helper/);
  });

  test("module requests never reach the app's middleware", async () => {
    const res = await fetch(`${origin}/app/admin/page.jsx`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Admin/);
  });

  test("an edited or added server route answers without a restart", async () => {
    const route = join(dir, "app", "api", "hello", "route.js");
    await writeFile(route, (await readFile(route, "utf8")).replace("hello: query.name", "greeting: query.name"));
    let body;
    for (let i = 0; i < 50 && !body?.greeting; i++) {
      body = await (await fetch(`${origin}/api/hello?name=x`)).json();
      if (!body.greeting) await delay(100);
    }
    assert.equal(body.greeting, "x");

    await mkdir(join(dir, "app", "api", "added"), { recursive: true });
    await writeFile(join(dir, "app", "api", "added", "route.js"), "export const GET = () => Response.json({ added: true });");
    let res;
    for (let i = 0; i < 50; i++) {
      res = await fetch(`${origin}/api/added`);
      if (res.headers.get("content-type")?.includes("json")) break;
      await delay(100);
    }
    assert.deepEqual(await res.json(), { added: true });
  });
});

describe("production build", () => {
  let dir, cleanup, child, origin;
  before(async () => {
    ({ dir, cleanup } = await copyFixture("fullstack"));
    const { createBuilder } = await import("vite");
    const builder = await createBuilder({ ...quiet, root: dir, plugins: [afw()] });
    await builder.buildApp();
    child = spawn(process.execPath, ["dist/server/index.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
    origin = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (c) => {
        out += c;
        const m = out.match(/listening on (http:\/\/\S+)/);
        if (m) resolve(m[1]);
      });
      child.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
    });
  });
  after(async () => {
    child?.kill();
    await cleanup?.();
  });

  test("emits the client and a Node server", async () => {
    assert.ok(await exists(join(dir, "dist", "client", "index.html")));
    assert.ok(await exists(join(dir, "dist", "server", "index.js")));
    assert.ok(await exists(join(dir, "dist", "server", "app.js")));
  });

  test("the built server passes the same contract on plain Node", () => serverContract(origin));

  test("the built server answers server functions", () => serverFunctionContract(origin, dir));

  test("the client bundle has the stubs and none of the server module", async () => {
    const { readdir } = await import("node:fs/promises");
    const assets = join(dir, "dist", "client", "assets");
    const code = (await Promise.all((await readdir(assets)).filter((f) => f.endsWith(".js")).map((f) => readFile(join(assets, f), "utf8")))).join("\n");
    assert.ok(code.includes(serverFunctionEndpoint(`${dir}/app`, `${dir}/app/todos/todos.server.js`, "addTodo")));
    assert.doesNotMatch(code, /server-only-secret|node:fs/);
  });

  test("serves hashed assets as immutable and refuses paths outside the client", async () => {
    const shell = await (await fetch(`${origin}/`, { headers: html })).text();
    const script = shell.match(/src="(\/assets\/[^"]+\.js)"/)[1];
    const asset = await fetch(`${origin}${script}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal((await fetch(`${origin}/%2e%2e/%2e%2e/package.json`)).status, 404);
    assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
  });
});

test("an app without server files builds the client alone", async () => {
  const { dir, cleanup } = await copyFixture("spa");
  try {
    await build({ ...quiet, root: dir, plugins: [afw()] });
    assert.ok(await exists(join(dir, "dist", "index.html")));
    assert.ok(!(await exists(join(dir, "dist", "server"))));
  } finally {
    await cleanup();
  }
});

test("server: false keeps a full-stack app's build client-only", async () => {
  const { dir, cleanup } = await copyFixture("fullstack");
  try {
    // No page calls a server function: a build with no server could not answer it.
    const page = join(dir, "app", "todos", "page.jsx");
    await writeFile(page, (await readFile(page, "utf8")).replace(/^import \{ addTodo.*$\n|^globalThis\.__todosFns.*$\n/gm, ""));
    // What `vite build` runs when the plugin configures no app build.
    await build({ ...quiet, root: dir, plugins: [afw({ server: false })] });
    assert.ok(await exists(join(dir, "dist", "index.html")));
    assert.ok(!(await exists(join(dir, "dist", "server"))));
  } finally {
    await cleanup();
  }
});

test("importing a server-only helper into browser code fails the build", async () => {
  const { dir, cleanup } = await copyFixture("fullstack");
  try {
    const page = join(dir, "app", "todos", "page.jsx");
    await writeFile(page, (await readFile(page, "utf8")).replace("import { addTodo, listTodos }", "import { addTodo, helper, listTodos }"));
    const { createBuilder } = await import("vite");
    await assert.rejects((await createBuilder({ ...quiet, root: dir, plugins: [afw()] })).buildApp(), /helper/);
  } finally {
    await cleanup();
  }
});

test("a server function in a build with no server is an error", async () => {
  const { dir, cleanup } = await copyFixture("fullstack");
  try {
    await assert.rejects(build({ ...quiet, root: dir, plugins: [afw({ server: false })] }), /has no server/);
  } finally {
    await cleanup();
  }
});

test("a page and an API route in one folder is an error", async () => {
  const { dir, cleanup } = await copyFixture("fullstack");
  try {
    await writeFile(join(dir, "app", "todos", "route.js"), "export const GET = () => new Response('x');");
    const { createBuilder } = await import("vite");
    await assert.rejects((await createBuilder({ ...quiet, root: dir, plugins: [afw()] })).buildApp(), /a page and an API route answer \/todos/);
  } finally {
    await cleanup();
  }
});
