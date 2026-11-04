import { afterAll, expect, test } from "runtime:test";

import { serverExports } from "@opentf/afw-build";
import { closeCompilers, resolveCompiler, startCompilerServer } from "../index.js";

afterAll(() => closeCompilers());

// The real compiler answering the build's `server-exports` request.
test("afwc lists a .server module's server functions over the serve protocol", async () => {
  const { afwc } = await resolveCompiler();
  const compiler = startCompilerServer(afwc, { sourceMap: true });
  const exports = await serverExports(compiler, "/app/todos/todos.server.ts", `
    import { query, action as act } from "@opentf/afw/server";
    import { z } from "zod";
    export const listTodos = query(async () => []);
    export const addTodo = act(z.object({ title: z.string() }), async ({ title }) => ({ title }));
    export const LIMIT = 10;
    export type Todo = { title: string };
  `);
  expect(exports).toEqual([
    { name: "listTodos", kind: "query" }, { name: "addTodo", kind: "action" }, { name: "LIMIT", kind: null },
  ]);
  await expect(serverExports(compiler, "/app/x.server.js", 'export * from "./y.server.js";')).rejects.toThrow("export * from");
});
