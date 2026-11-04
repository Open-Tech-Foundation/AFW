import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { action, query } from "@opentf/afw/server";

// Server-only: never part of the client bundle.
const SECRET = "server-only-secret-7f3a";

export const listTodos = query(async ({ prefix = "" } = {}, { locals }) => {
  const todos = JSON.parse(await readFile(join(process.cwd(), "data", "todos.json"), "utf8"));
  return { todos: todos.filter((t) => t.startsWith(prefix)), via: locals.via };
});

export const addTodo = action(async ({ title }) => {
  if (!title) throw new Response(JSON.stringify({ error: { message: "title required" } }), { status: 422 });
  return { added: title, checked: SECRET.length > 0 };
});

export function helper() {
  return SECRET;
}
