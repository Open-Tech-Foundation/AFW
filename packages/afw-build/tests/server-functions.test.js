import { describe, expect, test } from "runtime:test";

import {
  discoverServerModules, serverExports, serverFunctionEndpoint, serverFunctionStub, serverFunctionTable, serverModule,
} from "../index.js";
import { memoryHost } from "./memory-host.js";

const app = (files) => memoryHost(Object.fromEntries(Object.entries(files).map(([p, c]) => [`/site/app/${p}`, c])));
const exportsOf = (map) => async (file) => map[file.slice("/site/app/".length)] ?? [];

describe("serverFunctionEndpoint", () => {
  test("lives under the module's folder with a stable id that hides the path", () => {
    const a = serverFunctionEndpoint("/site/app", "/site/app/admin/users.server.js", "listUsers");
    expect(a).toMatch(/^\/admin\/__fn\/[0-9a-f]{16}$/);
    expect(a).not.toContain("users");
    expect(serverFunctionEndpoint("/site/app", "/site/app/admin/users.server.js", "listUsers")).toBe(a);
    expect(serverFunctionEndpoint("/site/app", "/site/app/admin/users.server.js", "deleteUser")).not.toBe(a);
    expect(serverFunctionEndpoint("/site/app", "/site/app/root.server.ts", "ping")).toMatch(/^\/__fn\/[0-9a-f]{16}$/);
  });

  test("a module outside the app directory is an error", () => {
    expect(() => serverFunctionEndpoint("/site/app", "/site/lib/db.server.js", "x")).toThrow("inside the app directory");
  });
});

test("discoverServerModules finds .server modules, skipping hidden and excluded folders", async () => {
  const host = app({
    "todos/todos.server.js": "", "admin/users.server.ts": "", "lib/db.server.mjs": "", "page.jsx": "",
    "todos/server.js": "", ".hidden/x.server.js": "", "drafts/y.server.js": "",
  });
  expect(await discoverServerModules(host, "/site/app", { exclude: ["drafts"] })).toEqual([
    "/site/app/admin/users.server.ts", "/site/app/lib/db.server.mjs", "/site/app/todos/todos.server.js",
  ]);
});

test("the browser stub exports one fetch stub per server function and no helpers", () => {
  const code = serverFunctionStub("/site/app", "/site/app/todos/todos.server.js", [
    { name: "listTodos", kind: "query" }, { name: "addTodo", kind: "action" }, { name: "db", kind: null }, { name: "default", kind: null },
  ]);
  expect(code).toContain('import { serverFunction } from "@opentf/afw";');
  expect(code).toMatch(/export const listTodos = serverFunction\("\/todos\/__fn\/[0-9a-f]{16}", "query"\);/);
  expect(code).toMatch(/export const addTodo = serverFunction\("\/todos\/__fn\/[0-9a-f]{16}", "action"\);/);
  expect(code).not.toContain("db");
  expect(code).not.toContain("export default");
});

test("the server table maps each endpoint to the real export, matching the stub", async () => {
  const host = app({ "todos/todos.server.js": "", "admin/helpers.server.js": "" });
  const listExports = exportsOf({
    "todos/todos.server.js": [{ name: "listTodos", kind: "query" }, { name: "db", kind: null }],
    "admin/helpers.server.js": [{ name: "format", kind: null }],
  });
  const { imports, table, files } = await serverFunctionTable(host, "/site/app", { listExports });
  expect(imports).toBe('import * as sf1 from "/site/app/todos/todos.server.js";');
  const endpoint = serverFunctionEndpoint("/site/app", "/site/app/todos/todos.server.js", "listTodos");
  expect(table).toBe(`  [${JSON.stringify(endpoint)}]: sf1["listTodos"],`);
  expect(files.length).toBe(2);
  expect(serverFunctionStub("/site/app", "/site/app/todos/todos.server.js", await listExports("/site/app/todos/todos.server.js"))).toContain(endpoint);
});

test("serverModule registers the functions and answers them inside the middleware", async () => {
  const host = app({ "todos/todos.server.js": "", "page.jsx": "" });
  const { code, files } = await serverModule(host, "/site/app", { listExports: exportsOf({ "todos/todos.server.js": [{ name: "listTodos", kind: "query" }] }) });
  expect(code).toContain("createServerFunctions");
  expect(code).toContain('import * as sf0 from "/site/app/todos/todos.server.js";');
  expect(code).toContain("(await serverFunctions.handle(request, { locals, env, ctx })) ??");
  expect(files).toContain("/site/app/todos/todos.server.js");
  expect((await serverModule(host, "/site/app")).code).toContain("createServerFunctions({\n\n})");
});

test("serverExports parses the compiler's answer", async () => {
  const compiler = { compile: async (id, source, component, target) => ({ code: JSON.stringify({ exports: [{ name: target, kind: "query" }] }), map: null }) };
  expect(await serverExports(compiler, "/a.server.js", "")).toEqual([{ name: "server-exports", kind: "query" }]);
});

test("an endpoint is the module folder's URL: route groups drop out, the hash keeps the full path", () => {
  const grouped = serverFunctionEndpoint("/site/app", "/site/app/(app)/todos/todos.server.js", "listTodos");
  expect(grouped).toMatch(/^\/todos\/__fn\/[0-9a-f]{16}$/);
  expect(grouped).not.toBe(serverFunctionEndpoint("/site/app", "/site/app/todos/todos.server.js", "listTodos"));
  expect(serverFunctionEndpoint("/site/app", "/site/app/(app)/x.server.js", "f")).toMatch(/^\/__fn\//);
});
