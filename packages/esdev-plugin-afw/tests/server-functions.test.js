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

    const listed = await call(`${listEndpoint}?a=${encodeURIComponent('{"prefix":"t"}')}`);
    expect(await listed.json()).toEqual({ prefix: "t", user: "ada", ok: true });
    const added = await call(serverFunctionEndpoint(app, join(app, "todos/todos.server.js"), "addTodo"), {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"title":"x"}',
    });
    expect(await added.json()).toEqual({ added: "x" });
    expect((await call(serverFunctionEndpoint(app, join(app, "admin/stats.server.js"), "stats"))).status).toBe(403);
    expect((await call(serverFunctionEndpoint(app, join(app, "todos/todos.server.js"), "helper"))).status).toBe(404);
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
