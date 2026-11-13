import { afterAll, expect, test } from "runtime:test";
import { build } from "runtime:build";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { dirname, fromFileURL, join, resolve } from "runtime:path";
import { cwd } from "runtime:process";

import { serverFunctionEndpoint } from "@opentf/afw-build";
import { closeCompilers, createAfwAppPlugin } from "../index.js";

afterAll(() => closeCompilers());

// The server bundle keeps @opentf/afw external; this package does not depend on it,
// so the test points the import at the workspace copy.
const AFW_SERVER = join(dirname(fromFileURL(import.meta.url)), "../../afw/server/index.js");
const PACKAGES = join(dirname(fromFileURL(import.meta.url)), "../..");
// A bare @opentf/* specifier left in a bundle → its workspace file.
function workspaceFile(spec) {
  const table = {
    "@opentf/afw": "afw/index.js", "@opentf/afw/server": "afw/server/index.js",
    "@opentf/afw-build/document": "afw-build/document.js",
  };
  if (!table[spec]) throw new Error(`unmapped external ${spec}`);
  return join(PACKAGES, table[spec]);
}

async function fixture() {
  await mkdir(".cache", { recursive: true });
  const dir = resolve(cwd(), await makeTempDir({ dir: ".cache", prefix: "server-fns-" }));
  const app = join(dir, "app");
  await mkdir(join(app, "todos"), { recursive: true });
  await mkdir(join(app, "admin"), { recursive: true });
  await write(join(app, "todos", "todos.server.js"), `
    import { action, query } from "@opentf/afw/server";
    const SECRET = "server-only-secret-91c2";
    export const listTodos = query(async ({ prefix }, { locals }) => ({ prefix, user: locals.user, ok: SECRET.length > 0 }));
    export const addTodo = action(async ({ title }) => ({ added: title }));
    export const helper = () => SECRET;
  `);
  await write(join(app, "admin", "stats.server.js"), `
    import { query } from "@opentf/afw/server";
    export const stats = query(async () => ({ users: 3 }));
  `);
  await write(join(app, "_middleware.js"), `
    export default async function middleware(request, context, next) {
      if (new URL(request.url).pathname.startsWith("/admin")) return new Response("denied", { status: 403 });
      context.locals.user = "ada";
      return next();
    }
  `);
  await write(join(dir, "client.js"), `import { addTodo, listTodos } from "./app/todos/todos.server.js"; globalThis.fns = { addTodo, listTodos };`);
  await write(join(dir, "server.js"), `import { createHandler } from "@afw/server"; export const handle = createHandler({ fallback: () => new Response("fallback", { status: 404 }) });`);
  return { dir, app };
}

const bundleCode = async (input, platform) => {
  const bundle = await build({ input, platform, plugins: [createAfwAppPlugin()] });
  try {
    const { output } = await bundle.generate({ format: "esm" });
    return output.map((chunk) => chunk.code ?? "").join("\n");
  } finally {
    await bundle.close();
  }
};

test("a browser build gets stubs; the server answers them under the folder's middleware", async () => {
  const { dir, app } = await fixture();
  try {
    const client = await bundleCode(join(dir, "client.js"), "browser");
    const listEndpoint = serverFunctionEndpoint(app, join(app, "todos/todos.server.js"), "listTodos");
    expect(client).toContain(listEndpoint);
    expect(client).not.toContain("server-only-secret");

    const server = await bundleCode(join(dir, "server.js"), "node");
    expect(server).toContain("locals.user"); // the real module
    await write(join(dir, "server.bundle.js"), server.replaceAll('"@opentf/afw/server"', JSON.stringify(AFW_SERVER)));
    const { handle } = await import(join(dir, "server.bundle.js"));
    const origin = "http://app.test";
    const call = (path, init = {}) => handle(new Request(`${origin}${path}`, { ...init, headers: { origin, ...init.headers } }));

    const listed = await call(`${listEndpoint}?a=${encodeURIComponent('{"v":{"prefix":"t"}}')}`);
    expect((await listed.json()).v).toEqual({ prefix: "t", user: "ada", ok: true });
    const added = await call(serverFunctionEndpoint(app, join(app, "todos/todos.server.js"), "addTodo"), {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"v":{"title":"x"}}',
    });
    expect((await added.json()).v).toEqual({ added: "x" });
    expect((await call(serverFunctionEndpoint(app, join(app, "admin/stats.server.js"), "stats"))).status).toBe(403);
    expect((await call(serverFunctionEndpoint(app, join(app, "todos/todos.server.js"), "helper"))).status).toBe(404);
  } finally {
    await remove(dir, { recursive: true });
  }
});

test("a server-rendered app's @afw/server renders pages, and a loader calls a server function directly", async () => {
  const { dir, app } = await fixture();
  try {
    await write(join(app, "_config.js"), 'export default { render: "server" };');
    await write(join(app, "todos", "loader.js"), `
      import { listTodos } from "./todos.server.js";
      export default async function loader({ locals }) { return listTodos({ prefix: "p" }, { locals }); }
    `);
    await write(join(app, "todos", "page.jsx"), `
      import { router } from "@opentf/afw";
      export default function Todos() { return <p id="who">{router.data?.user} {router.data?.prefix}</p>; }
    `);
    await write(join(dir, "server.js"), `
      import { createHandler, createPageRenderer } from "@afw/server";
      const shell = '<!doctype html><html><head><title>t</title></head><body><div id="app"></div></body></html>';
      export const handle = createHandler({ renderPage: createPageRenderer({ shell }), fallback: () => new Response("fallback", { status: 404 }) });
    `);
    // "server", as an esdev server target builds.
    const bundle = await build({ input: join(dir, "server.js"), platform: "server", plugins: [createAfwAppPlugin()] });
    let code;
    try {
      code = (await bundle.generate({ format: "esm" })).output.map((chunk) => chunk.code ?? "").join("\n");
    } finally {
      await bundle.close();
    }
    const externals = [...new Set([...code.matchAll(/from "(@opentf\/[^"]+)"/g)].map((m) => m[1]))];
    let linked = code;
    for (const spec of externals) linked = linked.replaceAll(`"${spec}"`, JSON.stringify(workspaceFile(spec)));
    await write(join(dir, "ssr.bundle.js"), linked);
    const { handle } = await import(join(dir, "ssr.bundle.js"));
    const res = await handle(new Request("http://app.test/todos", { headers: { accept: "text/html" } }));
    expect(res.status).toBe(200);
    const html = await res.text();
    // The loader's data, from a direct call that saw the middleware's locals.
    expect(html.replace(/<!--[^>]*-->/g, "")).toContain('<p id="who">ada p</p>');
    expect(html).toContain("data-afw-hydrate");
  } finally {
    await remove(dir, { recursive: true });
  }
});

test("importing a server-only helper into a browser build fails", async () => {
  const { dir } = await fixture();
  try {
    await write(join(dir, "client.js"), `import { helper } from "./app/todos/todos.server.js"; console.log(helper);`);
    await expect(bundleCode(join(dir, "client.js"), "browser")).rejects.toThrow("helper");
  } finally {
    await remove(dir, { recursive: true });
  }
});
