import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Data read with Node's fs, relative to where the server runs (the project root).
export default async function loader({ locals }) {
  const todos = JSON.parse(await readFile(join(process.cwd(), "data", "todos.json"), "utf8"));
  return { todos, via: locals.via };
}
