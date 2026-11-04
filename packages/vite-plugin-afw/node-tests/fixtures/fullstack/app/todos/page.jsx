import { router } from "@opentf/afw";
import { addTodo, listTodos } from "./todos.server.js";

// Exposed for the browser tests: the stubs the build put in place of the server module.
globalThis.__todosFns = { addTodo, listTodos };

export default function Todos() {
  return <ul id="todos">{(router.data?.todos ?? []).map((t) => <li>{t}</li>)}</ul>;
}
